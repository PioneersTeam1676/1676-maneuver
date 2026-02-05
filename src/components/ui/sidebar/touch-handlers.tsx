import * as React from "react"

export function SwipeToOpenDetector({ onOpen }: { onOpen: () => void }) {
  const elementRef = React.useRef<HTMLDivElement>(null)
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  React.useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      setIsDragging(false)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      
      const touch = e.touches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      
      // If we've moved more than 10px horizontally, consider it a potential sidebar gesture
      if (Math.abs(deltaX) > 10) {
        setIsDragging(true)
        
        // Only handle right swipes (opening sidebar) from the left edge
        if (deltaX > 0 && touchStartRef.current.x < 48) {
          // Prevent browser back navigation for right swipes from edge
          e.preventDefault()
          e.stopPropagation()
        }
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const minSwipeDistance = 80
      
      // Only open sidebar if:
      // 1. It's a horizontal swipe (deltaX > deltaY)
      // 2. It's a right swipe (deltaX > 0)
      // 3. It started from the left edge (x < 48px)
      // 4. The swipe distance is sufficient
      if (isDragging && 
          Math.abs(deltaX) > Math.abs(deltaY) && 
          deltaX > minSwipeDistance && 
          touchStartRef.current.x < 48) {
        
        // Prevent any browser default behavior
        e.preventDefault()
        e.stopPropagation()
        
        // Add haptic feedback on open
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(50)
        }
        onOpen()
      }
      
      touchStartRef.current = null
      setIsDragging(false)
    }

    // Add event listeners with explicit passive: false for touchmove
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: false })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
    }
  }, [onOpen, isDragging])

  return (
    <div
      ref={elementRef}
      className="fixed left-0 top-0 bottom-0 w-12 z-30 2xl:hidden"
      style={{ 
        touchAction: 'pan-y', // Allow vertical scrolling
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none'
      }}
    />
  )
}

export function MobileOverlay({ onClose }: { onClose: () => void }) {
  const elementRef = React.useRef<HTMLDivElement>(null)
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null)
  const [isDragging, setIsDragging] = React.useState(false)

  React.useEffect(() => {
    const element = elementRef.current
    if (!element) return

    const handleTouchStart = (e: TouchEvent) => {
      const touch = e.touches[0]
      touchStartRef.current = { x: touch.clientX, y: touch.clientY }
      setIsDragging(false)
    }

    const handleTouchMove = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      
      const touch = e.touches[0]
      const deltaX = Math.abs(touch.clientX - touchStartRef.current.x)
      const deltaY = Math.abs(touch.clientY - touchStartRef.current.y)
      
      // If we've moved more than 10px, consider it a drag
      if (deltaX > 10 || deltaY > 10) {
        setIsDragging(true)
      }
    }

    const handleTouchEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      
      const touch = e.changedTouches[0]
      const deltaX = touch.clientX - touchStartRef.current.x
      const deltaY = touch.clientY - touchStartRef.current.y
      const minSwipeDistance = 60
      
      // If it's a swipe to the left (closing gesture) or a tap (not dragging)
      if (!isDragging || (Math.abs(deltaX) > Math.abs(deltaY) && deltaX < -minSwipeDistance)) {
        // Add haptic feedback on close
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(50)
        }
        onClose()
      }
      
      touchStartRef.current = null
      setIsDragging(false)
    }

    const handleClick = () => {
      // Only close on direct clicks, not when dragging
      if (!isDragging) {
        // Add haptic feedback on close
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          navigator.vibrate(50)
        }
        onClose()
      }
    }

    // Add event listeners
    element.addEventListener('touchstart', handleTouchStart, { passive: true })
    element.addEventListener('touchmove', handleTouchMove, { passive: true })
    element.addEventListener('touchend', handleTouchEnd, { passive: true })
    element.addEventListener('click', handleClick)

    return () => {
      element.removeEventListener('touchstart', handleTouchStart)
      element.removeEventListener('touchmove', handleTouchMove)
      element.removeEventListener('touchend', handleTouchEnd)
      element.removeEventListener('click', handleClick)
    }
  }, [onClose, isDragging])

  return (
    <div
      ref={elementRef}
      className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm 2xl:hidden transition-opacity duration-300"
      aria-hidden="true"
      style={{ 
        touchAction: 'none', // Prevent default touch behaviors
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none'
      }}
    />
  )
}

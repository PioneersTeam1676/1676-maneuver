"use client"

import * as React from "react"
import * as SheetPrimitive from "@radix-ui/react-dialog"
import { XIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { haptics } from "@/lib/haptics"

function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({
  className,
  onSwipeDismiss,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Overlay> & {
  onSwipeDismiss?: () => void;
}) {
  // Touch event handlers for swipe-to-dismiss on overlay
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = React.useRef<{ x: number; y: number } | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    
    touchEndRef.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current) return;

    const deltaX = Math.abs(touchEndRef.current.x - touchStartRef.current.x);
    const deltaY = Math.abs(touchEndRef.current.y - touchStartRef.current.y);
    const threshold = 50;

    // If there's significant movement in any direction, trigger dismiss
    if (deltaX > threshold || deltaY > threshold) {
      haptics.vibrate(50);
      onSwipeDismiss?.();
    }

    // Reset touch references
    touchStartRef.current = null;
    touchEndRef.current = null;
  };

  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50",
        className
      )}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  side = "right",
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  side?: "top" | "right" | "bottom" | "left"
}) {
  const closeButtonRef = React.useRef<HTMLButtonElement>(null);
  const contentRef = React.useRef<HTMLDivElement>(null);
  
  // Touch event handlers for swipe-to-dismiss with drag preview
  const touchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const touchEndRef = React.useRef<{ x: number; y: number } | null>(null);
  const lastTouchRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const isDraggingRef = React.useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartRef.current = {
      x: e.targetTouches[0].clientX,
      y: e.targetTouches[0].clientY,
    };
    isDraggingRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current || !contentRef.current) return;
    
    const currentX = e.targetTouches[0].clientX;
    const currentY = e.targetTouches[0].clientY;
    const currentTime = Date.now();
    
    touchEndRef.current = { x: currentX, y: currentY };
    lastTouchRef.current = { x: currentX, y: currentY, time: currentTime };

    const deltaX = currentX - touchStartRef.current.x;
    const deltaY = currentY - touchStartRef.current.y;
    
    // Calculate maximum drag distance based on viewport dimensions
    const maxVerticalDrag = window.innerHeight * 0.8; // 80% of viewport height
    const maxHorizontalDrag = window.innerWidth * 0.8; // 80% of viewport width
    
    // Only apply transform for the appropriate direction based on sheet side
    let shouldTransform = false;
    let transform = '';

    switch (side) {
      case "bottom":
        if (deltaY > 0) { // Only drag down
          shouldTransform = true;
          transform = `translateY(${Math.min(deltaY, maxVerticalDrag)}px)`;
          isDraggingRef.current = true;
        }
        break;
      case "top":
        if (deltaY < 0) { // Only drag up
          shouldTransform = true;
          transform = `translateY(${Math.max(deltaY, -maxVerticalDrag)}px)`;
          isDraggingRef.current = true;
        }
        break;
      case "right":
        if (deltaX > 0) { // Only drag right
          shouldTransform = true;
          transform = `translateX(${Math.min(deltaX, maxHorizontalDrag)}px)`;
          isDraggingRef.current = true;
        }
        break;
      case "left":
        if (deltaX < 0) { // Only drag left
          shouldTransform = true;
          transform = `translateX(${Math.max(deltaX, -maxHorizontalDrag)}px)`;
          isDraggingRef.current = true;
        }
        break;
    }

    if (shouldTransform) {
      contentRef.current.style.transform = transform;
      contentRef.current.style.transition = 'none'; // Disable transition during drag
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current || !touchEndRef.current || !contentRef.current) return;

    const deltaX = touchEndRef.current.x - touchStartRef.current.x;
    const deltaY = touchEndRef.current.y - touchStartRef.current.y;
    const dismissThreshold = 100; // Need to drag 100px to dismiss
    const dragThreshold = 20; // Minimum drag to register as dragging
    const velocityThreshold = 1.0; // Increased velocity threshold for quick flicks
    const counterVelocityThreshold = 0.8; // Threshold for detecting counter-movement

    let shouldClose = false;
    let wasDragging = false;

    // Calculate velocity if we have recent touch data
    let velocity = 0;
    let hasRecentTouch = false;
    
    if (lastTouchRef.current && touchEndRef.current) {
      const timeDiff = Date.now() - lastTouchRef.current.time;
      if (timeDiff > 0 && timeDiff < 150) { // Extended window to 150ms for better detection
        hasRecentTouch = true;
        switch (side) {
          case "bottom":
            velocity = (touchEndRef.current.y - lastTouchRef.current.y) / timeDiff;
            break;
          case "top":
            velocity = (lastTouchRef.current.y - touchEndRef.current.y) / timeDiff;
            break;
          case "right":
            velocity = (touchEndRef.current.x - lastTouchRef.current.x) / timeDiff;
            break;
          case "left":
            velocity = (lastTouchRef.current.x - touchEndRef.current.x) / timeDiff;
            break;
        }
      }
    }

    // Check if we dragged far enough to dismiss based on sheet side
    // New logic: Only dismiss if BOTH conditions are met:
    // 1. Distance threshold is met AND no strong counter-velocity
    // 2. OR strong positive velocity (quick flick in dismiss direction)
    switch (side) {
      case "bottom":
        wasDragging = deltaY > dragThreshold;
        // Only dismiss if:
        // - Dragged far enough AND not flicking back up strongly
        // - OR quick downward flick regardless of distance
        shouldClose = (deltaY > dismissThreshold && (!hasRecentTouch || velocity >= -counterVelocityThreshold)) || 
                      (hasRecentTouch && velocity > velocityThreshold);
        break;
      case "top":
        wasDragging = deltaY < -dragThreshold;
        shouldClose = (deltaY < -dismissThreshold && (!hasRecentTouch || velocity >= -counterVelocityThreshold)) || 
                      (hasRecentTouch && velocity > velocityThreshold);
        break;
      case "right":
        wasDragging = deltaX > dragThreshold;
        shouldClose = (deltaX > dismissThreshold && (!hasRecentTouch || velocity >= -counterVelocityThreshold)) || 
                      (hasRecentTouch && velocity > velocityThreshold);
        break;
      case "left":
        wasDragging = deltaX < -dragThreshold;
        shouldClose = (deltaX < -dismissThreshold && (!hasRecentTouch || velocity >= -counterVelocityThreshold)) || 
                      (hasRecentTouch && velocity > velocityThreshold);
        break;
    }

    // Re-enable transition for snap-back animation
    contentRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';

    if (shouldClose) {
      haptics.vibrate(50);
      // Trigger the close button click to close the sheet
      closeButtonRef.current?.click();
    } else if (wasDragging) {
      // Snap back to original position
      contentRef.current.style.transform = 'translateX(0) translateY(0)';
      haptics.vibrate(25); // Lighter haptic for snap-back
      
      // Reset transition after animation completes
      setTimeout(() => {
        if (contentRef.current) {
          contentRef.current.style.transition = '';
        }
      }, 300);
    }

    // Reset touch references
    touchStartRef.current = null;
    touchEndRef.current = null;
    lastTouchRef.current = null;
    isDraggingRef.current = false;
  };

  const handleOverlaySwipeDismiss = () => {
    closeButtonRef.current?.click();
  };

  return (
    <SheetPortal>
      <SheetOverlay onSwipeDismiss={handleOverlaySwipeDismiss} />
      <SheetPrimitive.Content
        ref={contentRef}
        data-slot="sheet-content"
        className={cn(
          "bg-background data-[state=open]:animate-in data-[state=closed]:animate-out fixed z-50 flex flex-col gap-4 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
          side === "right" &&
            "data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right inset-y-0 right-0 h-full w-3/4 border-l sm:max-w-sm",
          side === "left" &&
            "data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left inset-y-0 left-0 h-full w-3/4 border-r sm:max-w-sm",
          side === "top" &&
            "data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top inset-x-0 top-0 h-auto border-b",
          side === "bottom" &&
            "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom inset-x-0 bottom-0 h-auto border-t",
          className
        )}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        {...props}
      >
        {children}
        <SheetPrimitive.Close 
          ref={closeButtonRef}
          className="ring-offset-background focus:ring-ring data-[state=open]:bg-secondary absolute top-4 right-4 rounded-xs opacity-70 transition-opacity hover:opacity-100 focus:ring-2 focus:ring-offset-2 focus:outline-hidden disabled:pointer-events-none"
        >
          <XIcon className="size-4" />
          <span className="sr-only">Close</span>
        </SheetPrimitive.Close>
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-header"
      className={cn("flex flex-col gap-1.5 p-4", className)}
      {...props}
    />
  )
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn("mt-auto flex flex-col gap-2 p-4", className)}
      {...props}
    />
  )
}

function SheetTitle({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title
      data-slot="sheet-title"
      className={cn("text-foreground font-semibold", className)}
      {...props}
    />
  )
}

function SheetDescription({
  className,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Description>) {
  return (
    <SheetPrimitive.Description
      data-slot="sheet-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

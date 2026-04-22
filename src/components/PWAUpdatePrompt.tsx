import { useEffect, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { analytics } from '@/lib/analytics'

export function PWAUpdatePrompt() {
  const [dismissed, setDismissed] = useState(false)
  const { needRefresh, updateServiceWorker } = useRegisterSW({
    immediate: true,
  })
  const [showPrompt] = needRefresh
  const [applyingUpdate, setApplyingUpdate] = useState(false)

  useEffect(() => {
    if (showPrompt) {
      setDismissed(false)
      return
    }

    setApplyingUpdate(false)
  }, [showPrompt])

  const handleUpdate = async () => {
    analytics.trackPWAUpdate()
    setApplyingUpdate(true)
    setDismissed(false)

    try {
      await updateServiceWorker()
    } catch {
      setApplyingUpdate(false)
    }
  }

  const handleClose = () => {
    setDismissed(true)
  }

  if (!showPrompt || dismissed) return null

  return (
    <Card className="fixed inset-x-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 mx-auto w-auto max-w-80 shadow-lg">
      <CardContent className="p-4">
        <div className="space-y-3">
          <p className="text-sm font-medium">
            A new version of Pioneer Scouting is available!
          </p>
          <p className="text-xs text-muted-foreground">
            Update now to get the latest features and improvements.
          </p>
          <p className="text-xs text-red-400">
            WARNING: This will refresh the app and apply the update.
          </p>
          <div className="flex gap-2">
            <Button size="sm" onClick={handleUpdate} disabled={applyingUpdate}>
              {applyingUpdate ? 'Updating...' : 'Update Now'}
            </Button>
            <Button size="sm" variant="outline" onClick={handleClose} disabled={applyingUpdate}>
              Later
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

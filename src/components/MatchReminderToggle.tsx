import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Bell, BellOff } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { decodeVapidKey, persistSubscription, removeSubscription } from "@/lib/pushNotifications"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const DEFAULT_MATCH_REMINDER_LEAD = 5
const parseReminderLead = (value: string | undefined) => {
  if (!value) return undefined
  const parsed = Number.parseInt(value.trim(), 10)
  return Number.isNaN(parsed) || parsed <= 0 ? undefined : parsed
}

const REMINDER_MATCH_LEAD =
  parseReminderLead(import.meta.env.VITE_MATCH_NOTIFICATION_LOOKAHEAD as string | undefined) ?? DEFAULT_MATCH_REMINDER_LEAD

const REMINDER_MATCH_LEAD_COPY = `${REMINDER_MATCH_LEAD} match${REMINDER_MATCH_LEAD === 1 ? "" : "es"}`

const resolveInitialPermission = (): NotificationPermission => {
  if (typeof Notification === "undefined") {
    return "default"
  }
  return Notification.permission
}

type SubscriptionStatus = "loading" | "inactive" | "subscribed" | "denied" | "unsupported"

type MatchReminderToggleProps = {
  showCard?: boolean
  autoPrompt?: boolean
}

const MatchReminderToggle = ({ showCard = true, autoPrompt = true }: MatchReminderToggleProps) => {
  const { user } = useAuth()
  const [status, setStatus] = useState<SubscriptionStatus>("loading")
  const [permission, setPermission] = useState<NotificationPermission>(() => resolveInitialPermission())

  const vapidKey = useMemo(() => {
    const raw = (import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined)?.trim()
    return raw && raw.length > 0 ? raw : null
  }, [])

  const isSupported = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && Boolean(vapidKey)
  const normalizedEmail = user?.email ? normalizeEmail(user.email) : null
  const [showPermissionModal, setShowPermissionModal] = useState(false)
  const hasPromptedForPermission = useRef(false)

  // Debug logging
  useEffect(() => {
    if (import.meta.env.DEV && autoPrompt && !showCard) {
      console.log('[MatchReminder] Background watcher active', { user: user?.email, status, permission, isSupported, vapidKey: !!vapidKey })
    }
  }, [autoPrompt, showCard, user?.email, status, permission, isSupported, vapidKey])

  useEffect(() => {
    if (!isSupported) {
      setStatus("unsupported")
      return
    }

    let cancelled = false

    const detectSubscription = async () => {
      try {
        const registration = await navigator.serviceWorker.ready
        const subscription = await registration.pushManager.getSubscription()
        if (cancelled) return

        if (subscription) {
          if (normalizedEmail) {
            await persistSubscription({
              email: normalizedEmail,
              subscription: subscription.toJSON(),
              userAgent: navigator.userAgent,
            })
          }
          setStatus("subscribed")
        } else if (permission === "denied") {
          setStatus("denied")
        } else {
          setStatus("inactive")
        }
      } catch (error) {
        console.warn("Failed to inspect push subscription", error)
        if (!cancelled) {
          setStatus(permission === "denied" ? "denied" : "inactive")
        }
      }
    }

    void detectSubscription()

    return () => {
      cancelled = true
    }
  }, [isSupported, normalizedEmail, permission])

  useEffect(() => {
    if (!autoPrompt) return
    if (status === "subscribed") {
      setShowPermissionModal(false)
      hasPromptedForPermission.current = false
      return
    }

    if (permission === "granted") return

    const timer = setTimeout(() => {
      if (!hasPromptedForPermission.current) {
        setShowPermissionModal(true)
        hasPromptedForPermission.current = true
      }
    }, 3000)

    return () => clearTimeout(timer)
  }, [autoPrompt, status, permission, vapidKey, isSupported])

  const handleSubscribe = useCallback(async () => {
    if (!normalizedEmail) {
      toast.info("Sign in with your scouting account to enable reminders.")
      return
    }

    if (permission === "denied") {
      toast.error("Browser notifications are blocked. Update your browser settings to allow notifications.")
      setStatus("denied")
      return
    }

    setStatus("loading")

    try {
      let currentPermission: NotificationPermission = permission
      if (typeof Notification !== "undefined" && currentPermission !== "granted") {
        currentPermission = await Notification.requestPermission()
        setPermission(currentPermission)
      }

      if (currentPermission !== "granted") {
        setStatus(currentPermission === "denied" ? "denied" : "inactive")
        if (currentPermission === "denied") {
          toast.error("Notifications are disabled. Enable them in your browser settings to receive reminders.")
        }
        return
      }

      // If permission is granted but push isn't fully supported, inform the user gracefully
      if (!isSupported || !vapidKey) {
        setStatus("inactive")
        toast.info("Notifications allowed, but push subscriptions aren't available on this device/browser yet. Make sure it's installed to Home Screen and on iOS 16.4+.")
        return
      }

      const registration = await navigator.serviceWorker.ready
      let subscription = await registration.pushManager.getSubscription()
      if (!subscription) {
        const serverKey = decodeVapidKey(vapidKey)
        const applicationKey = serverKey.buffer.slice(0) as ArrayBuffer
        subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationKey,
        })
      }

      await persistSubscription({
        email: normalizedEmail,
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      })

      setStatus("subscribed")
      setShowPermissionModal(false)
      hasPromptedForPermission.current = false
      toast.success(`Match reminders enabled. We'll notify you ${REMINDER_MATCH_LEAD_COPY} before your shift.`)
    } catch (error) {
      console.warn("Failed to enable match reminders", error)
      setStatus("inactive")
      toast.error("Could not enable match reminders. Try again later.")
    }
  }, [isSupported, normalizedEmail, permission, vapidKey])

  const handleUnsubscribe = useCallback(async () => {
    if (!isSupported) {
      return
    }

    setStatus("loading")
    try {
      const registration = await navigator.serviceWorker.ready
      const subscription = await registration.pushManager.getSubscription()
      if (subscription) {
        await removeSubscription(subscription.endpoint)
        await subscription.unsubscribe()
      }
      setStatus("inactive")
      toast.success("Match reminders disabled.")
    } catch (error) {
      console.warn("Failed to disable match reminders", error)
      setStatus("subscribed")
      toast.error("Could not disable match reminders. Try again later.")
    }
  }, [isSupported])

  const canRequestPermission = typeof Notification !== "undefined"
  const canSubscribe = isSupported && Boolean(vapidKey)

  const permissionBlocked = permission === "denied"
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  
  const modalDescription = permissionBlocked
    ? (isIOS
        ? "Notifications are blocked. Go to Settings > Notifications > Web Apps > Allow Notifications, then return to this app."
        : "Notifications are blocked for this site. Update your browser settings to allow match reminders, then try again.")
    : !canSubscribe
      ? (isIOS
          ? `Tap "Allow Notifications" below. If reminders don't enable, make sure the app is installed to Home Screen, you're on iOS 16.4+, and you've opened it from the Home Screen icon.`
          : `Your browser might not support push subscriptions here. You can still try enabling notifications.`)
      : (isIOS
          ? `Tap "Allow Notifications" below, then tap "Allow" on the iOS prompt to get alerts ${REMINDER_MATCH_LEAD_COPY} before your shifts.`
          : `Enable browser notifications so we can alert you ${REMINDER_MATCH_LEAD_COPY} before each scouting shift.`)

  const handleToggleClick = () => {
    if (status === "subscribed") {
      void handleUnsubscribe()
      return
    }

    if (permission === "granted") {
      void handleSubscribe()
      return
    }

    setShowPermissionModal(true)
  }

  const description = (() => {
    switch (status) {
      case "subscribed":
        return `You'll get alerted ${REMINDER_MATCH_LEAD_COPY} before your next assignment.`
      case "denied":
        return "Notifications are blocked. Enable them in your browser settings to receive reminders."
      default:
        return `Get a push notification ${REMINDER_MATCH_LEAD_COPY} before it's your turn to scout.`
    }
  })()

  return (
    <>
      <Dialog open={showPermissionModal} onOpenChange={setShowPermissionModal}>
        <DialogContent className="z-[10000] max-w-[calc(100vw-32px)] sm:max-w-md rounded-2xl border-none shadow-2xl bg-gradient-to-b from-background to-muted/20">
          <DialogHeader className="space-y-4 text-center pb-2">
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-2 animate-in zoom-in duration-300">
              <Bell className="h-8 w-8 text-primary" />
            </div>
            <DialogTitle className="text-2xl sm:text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-primary/60 bg-clip-text text-transparent">
              Stay in the loop
            </DialogTitle>
            <DialogDescription className="text-base sm:text-lg leading-relaxed text-foreground/80 px-2">
              {modalDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-3 pt-4 sm:flex-col sm:items-stretch sm:justify-start">
            {permissionBlocked ? (
              <Button 
                variant="secondary" 
                onClick={() => setShowPermissionModal(false)}
                className="w-full h-12 text-base font-semibold rounded-xl"
              >
                I'll update settings
              </Button>
            ) : (
              <>
                <Button 
                  variant="ghost" 
                  onClick={() => setShowPermissionModal(false)} 
                  className="w-full h-11 text-sm font-medium rounded-xl text-muted-foreground hover:text-foreground"
                >
                  Maybe later
                </Button>
                <Button 
                  onClick={() => void handleSubscribe()} 
                  disabled={status === "loading" || !canRequestPermission} 
                  className="w-full h-14 text-lg font-bold rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                >
                  <Bell className="h-5 w-5 mr-2" />
                  {isIOS ? "Allow Notifications" : "Enable Notifications"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showCard && (
        <div className="group rounded-2xl border-2 border-dashed border-muted-foreground/20 hover:border-primary/30 p-5 sm:p-6 transition-all duration-300 hover:shadow-lg hover:shadow-primary/5 bg-gradient-to-br from-background to-muted/5" data-match-reminders-card>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <p className="text-base sm:text-lg font-semibold text-foreground tracking-tight">Match Reminders</p>
              </div>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed pl-4">{description}</p>
            </div>
            <Button
              variant={status === "subscribed" ? "secondary" : "default"}
              size="lg"
              disabled={status === "loading"}
              onClick={handleToggleClick}
              className="flex items-center justify-center gap-2.5 min-w-[140px] h-12 rounded-xl font-semibold shadow-md hover:shadow-lg transition-all duration-200 text-base group-hover:scale-105"
            >
              {status === "subscribed" ? (
                <>
                  <BellOff className="h-5 w-5" />
                  <span>Enabled</span>
                </>
              ) : (
                <>
                  <Bell className="h-5 w-5" />
                  <span>Enable</span>
                </>
              )}
            </Button>
          </div>
        </div>
      )}
    </>
  )
}

export default MatchReminderToggle

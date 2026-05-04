import { useCallback, useEffect, useState } from "react"
import { AlertOctagon, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  PENDING_QUEUE_CHANGED_EVENT,
  getPendingSubmissions,
  replayPendingSubmissions,
  type PendingSubmission,
} from "@/lib/pendingScoutingQueue"
import { useScoutingSession } from "@/hooks/useScoutingSession"

const RETRY_INTERVAL_MS = 60_000

const PendingScoutingBanner = () => {
  const { isInScoutingSession } = useScoutingSession()
  const [pending, setPending] = useState<PendingSubmission[]>([])
  const [retrying, setRetrying] = useState(false)

  const refresh = useCallback(() => {
    setPending(getPendingSubmissions())
  }, [])

  useEffect(() => {
    refresh()
    const onChange = () => refresh()
    window.addEventListener(PENDING_QUEUE_CHANGED_EVENT, onChange)
    window.addEventListener("focus", refresh)
    document.addEventListener("visibilitychange", refresh)
    return () => {
      window.removeEventListener(PENDING_QUEUE_CHANGED_EVENT, onChange)
      window.removeEventListener("focus", refresh)
      document.removeEventListener("visibilitychange", refresh)
    }
  }, [refresh])

  const handleRetry = useCallback(async () => {
    if (retrying) return
    setRetrying(true)
    try {
      const result = await replayPendingSubmissions()
      if (result.recovered > 0) {
        toast.success(
          `Recovered ${result.recovered} backup entr${result.recovered === 1 ? "y" : "ies"}.`,
        )
      }
      if (result.remaining > 0) {
        const last = result.failed[result.failed.length - 1]?.lastError
        toast.error(
          `${result.remaining} entr${result.remaining === 1 ? "y" : "ies"} still failing${
            last?.name ? `: ${last.name}` : ""
          }${last?.message ? ` — ${last.message}` : ""}`,
          { duration: 12000 },
        )
      }
    } finally {
      setRetrying(false)
      refresh()
    }
  }, [retrying, refresh])

  useEffect(() => {
    if (pending.length === 0) return
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return
      if (typeof navigator !== "undefined" && !navigator.onLine) return
      void handleRetry()
    }, RETRY_INTERVAL_MS)
    return () => window.clearInterval(id)
  }, [pending.length, handleRetry])

  if (pending.length === 0) return null
  if (isInScoutingSession) return null

  const lastError = pending[pending.length - 1]?.lastError

  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 border-b border-red-500/40 bg-red-500/15 px-4 py-2 text-red-900 dark:text-red-200"
    >
      <div className="mx-auto flex max-w-screen-md items-center gap-3 text-sm">
        {retrying ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        ) : (
          <AlertOctagon className="h-4 w-4 shrink-0" />
        )}
        <span className="flex-1">
          {pending.length} match entr{pending.length === 1 ? "y" : "ies"} stuck in offline backup
          {lastError?.name ? ` (${lastError.name})` : ""}.
          {" "}
          Tap retry — if it keeps failing, screenshot this and tell a lead.
        </span>
        <Button
          size="sm"
          variant="outline"
          onClick={() => void handleRetry()}
          disabled={retrying}
          className="h-8"
        >
          {retrying ? "Retrying…" : "Retry"}
        </Button>
      </div>
    </div>
  )
}

export default PendingScoutingBanner

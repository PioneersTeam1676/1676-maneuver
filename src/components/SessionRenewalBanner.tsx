import { useCallback, useEffect, useState } from "react"
import { AlertTriangle, CloudUpload, Loader2, ServerCrash } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { useAuth } from "@/contexts/AuthContext"
import { useScoutingSession } from "@/hooks/useScoutingSession"
import {
  API_AUTH_FAILURE_EVENT,
  API_REACHABLE_EVENT,
  API_UNAVAILABLE_EVENT,
  AUTH_REFRESHED_EVENT,
  hasUsableAuthToken,
  pingApi,
} from "@/lib/apiClient"
import { db, pitDB, syncCachedPitScoutingEntries, syncCachedScoutingEntries } from "@/lib/dexieDB"

const POLL_INTERVAL_MS = 15_000
const PENDING_POLL_INTERVAL_MS = 10_000

const SessionRenewalBanner = () => {
  const { user, renewSession } = useAuth()
  const { isInScoutingSession } = useScoutingSession()
  const [needsRenewal, setNeedsRenewal] = useState(false)
  // Tokens are no longer deleted client-side when they look expired — the
  // server is the authority. So "session expired" is now signalled by an
  // actual 401 (API_AUTH_FAILURE_EVENT), not by the token disappearing.
  const [authFailed, setAuthFailed] = useState(false)
  // Server reachable but answering 503 (in practice: MySQL down). This is
  // NOT a session problem — credentials are intact — so it gets its own
  // banner instead of the misleading "Session expired".
  const [serverUnavailable, setServerUnavailable] = useState(false)
  const [retrying, setRetrying] = useState(false)
  const [renewing, setRenewing] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [syncing, setSyncing] = useState(false)

  const evaluate = useCallback(() => {
    setNeedsRenewal(Boolean(user) && !hasUsableAuthToken())
  }, [user])

  useEffect(() => {
    evaluate()
    const interval = window.setInterval(evaluate, POLL_INTERVAL_MS)
    const onAuthFailure = () => {
      setAuthFailed(true)
      evaluate()
    }
    const onAuthRefreshed = () => {
      setRenewing(false)
      setNeedsRenewal(false)
      setAuthFailed(false)
      setServerUnavailable(false)
    }
    const onApiUnavailable = () => {
      setServerUnavailable(true)
      // A 503 during the outage can never mean "expired"; drop any stale flag.
      setAuthFailed(false)
    }
    const onApiReachable = () => {
      setServerUnavailable(false)
    }
    const onVisibility = () => {
      if (document.visibilityState === "visible") evaluate()
    }
    window.addEventListener(API_AUTH_FAILURE_EVENT, onAuthFailure)
    window.addEventListener(AUTH_REFRESHED_EVENT, onAuthRefreshed)
    window.addEventListener(API_UNAVAILABLE_EVENT, onApiUnavailable)
    window.addEventListener(API_REACHABLE_EVENT, onApiReachable)
    document.addEventListener("visibilitychange", onVisibility)
    window.addEventListener("focus", evaluate)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener(API_AUTH_FAILURE_EVENT, onAuthFailure)
      window.removeEventListener(AUTH_REFRESHED_EVENT, onAuthRefreshed)
      window.removeEventListener(API_UNAVAILABLE_EVENT, onApiUnavailable)
      window.removeEventListener(API_REACHABLE_EVENT, onApiReachable)
      document.removeEventListener("visibilitychange", onVisibility)
      window.removeEventListener("focus", evaluate)
    }
  }, [evaluate])

  const triggerRenew = useCallback(() => {
    setRenewing(true)
    void renewSession().then((ok) => {
      // A successful silent refresh resolves true without reloading the
      // page; the Google fallback redirects away, so this only matters for
      // the failure case.
      if (!ok) setRenewing(false)
    }).catch(() => {
      setRenewing(false)
    })
  }, [renewSession])

  // /health probes MySQL for real, so a 200 here means the outage is over;
  // apiClient then fires API_REACHABLE_EVENT which clears the banner.
  const triggerRetry = useCallback(() => {
    setRetrying(true)
    void pingApi()
      .then(() => {
        setServerUnavailable(false)
        toast.success("Server is back. Syncing will resume automatically.")
      })
      .catch(() => {
        toast.error("Still can't reach the scouting server. Your entries stay saved on this device.")
      })
      .finally(() => setRetrying(false))
  }, [])

  const refreshPendingCount = useCallback(async () => {
    try {
      const [scouting, pit] = await Promise.all([
        db.scoutingData.filter((entry) => entry.synced === false).count(),
        pitDB.pitScoutingData.filter((entry) => entry.synced === false).count(),
      ])
      setPendingCount(scouting + pit)
    } catch {
      setPendingCount(0)
    }
  }, [])

  useEffect(() => {
    void refreshPendingCount()
    const interval = window.setInterval(() => {
      void refreshPendingCount()
    }, PENDING_POLL_INTERVAL_MS)
    const onRefreshed = () => {
      void refreshPendingCount()
    }
    window.addEventListener(AUTH_REFRESHED_EVENT, onRefreshed)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener(AUTH_REFRESHED_EVENT, onRefreshed)
    }
  }, [refreshPendingCount])

  const triggerSync = useCallback(async () => {
    if (syncing) return
    setSyncing(true)
    const before = pendingCount
    const errors: string[] = []
    const results = await Promise.allSettled([
      syncCachedScoutingEntries(),
      syncCachedPitScoutingEntries(),
    ])
    results.forEach((result) => {
      if (result.status === "rejected") {
        const message = result.reason instanceof Error ? result.reason.message : String(result.reason)
        errors.push(message)
      }
    })
    await refreshPendingCount()
    setSyncing(false)
    if (errors.length) {
      toast.error("Sync failed", {
        description: errors.join(" · "),
        duration: 8000,
      })
    } else if (before > 0) {
      toast.success(`Synced ${before} entr${before === 1 ? "y" : "ies"}`)
    }
  }, [syncing, pendingCount, refreshPendingCount])

  if (!user || isInScoutingSession) return null

  if (serverUnavailable) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 border-b border-red-500/40 bg-red-500/10 px-4 py-2 text-red-900 dark:text-red-200"
      >
        <div className="mx-auto flex max-w-screen-md items-center gap-3 text-sm">
          {retrying ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ServerCrash className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">
            {pendingCount > 0
              ? `Scouting server is down (not your login). ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} saved on this device and will sync when it's back.`
              : "Scouting server is down (not your login). Keep scouting — entries save on this device."}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={triggerRetry}
            disabled={retrying}
            className="h-8"
          >
            {retrying ? "Checking…" : "Retry"}
          </Button>
        </div>
      </div>
    )
  }

  if (needsRenewal || authFailed) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 border-b border-amber-500/40 bg-amber-500/15 px-4 py-2 text-amber-900 dark:text-amber-200"
      >
        <div className="mx-auto flex max-w-screen-md items-center gap-3 text-sm">
          {renewing ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <AlertTriangle className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">
            {renewing
              ? "Refreshing session…"
              : pendingCount > 0
                ? `Session expired. ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"} waiting to sync. Tap Renew when you're between matches.`
                : "Session expired. Tap Renew when you're between matches — renewing reloads the page."}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={triggerRenew}
            disabled={renewing}
            className="h-8"
          >
            {renewing ? "Refreshing…" : "Renew now"}
          </Button>
        </div>
      </div>
    )
  }

  if (pendingCount > 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="sticky top-0 z-50 border-b border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sky-900 dark:text-sky-200"
      >
        <div className="mx-auto flex max-w-screen-md items-center gap-3 text-sm">
          {syncing ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <CloudUpload className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1">
            {syncing
              ? `Syncing ${pendingCount} entr${pendingCount === 1 ? "y" : "ies"}…`
              : `${pendingCount} scouting entr${pendingCount === 1 ? "y" : "ies"} not yet uploaded.`}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => void triggerSync()}
            disabled={syncing}
            className="h-8"
          >
            {syncing ? "Syncing…" : "Sync now"}
          </Button>
        </div>
      </div>
    )
  }

  return null
}

export default SessionRenewalBanner

import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Loader2, XCircle } from "lucide-react"

const fragmentToSearchParams = () => {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : ""
  if (hash) {
    return new URLSearchParams(hash)
  }
  const query = window.location.search.startsWith("?") ? window.location.search.slice(1) : ""
  return new URLSearchParams(query)
}

const decodeIdTokenPreview = (token: string) => {
  try {
    const segment = token.split(".")[1]
    if (!segment) return null
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/")
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4)
    const json = atob(padded)
    return JSON.parse(json) as { email?: string; name?: string }
  } catch (error) {
    console.warn("Failed to decode ID token preview", error)
    return null
  }
}

// A remount of this page (router rebuild, StrictMode) must not post the same
// token again: the state is single-use, so a second post reports a failure
// even though the first one signed the user in.
const postedStates = new Set<string>()

const AuthCallbackPage = () => {
  const [status, setStatus] = useState<"pending" | "success" | "error">("pending")
  const succeededRef = useRef(false)
  const [message, setMessage] = useState("Finishing Google sign-in…")
  const params = useMemo(fragmentToSearchParams, [])
  const [sent, setSent] = useState(false)
  const [profile, setProfile] = useState<{ email?: string; name?: string } | null>(null)
  const navigate = useNavigate()
  const hasOpener = useMemo(() => typeof window !== "undefined" && !!window.opener, [])

  useEffect(() => {
    const error = params.get("error")
    const state = params.get("state")
    if (error) {
      const payload = {
        type: "google-oauth-error" as const,
        error,
        errorDescription: params.get("error_description") || "Google sign-in was cancelled.",
        state,
      }

      if (hasOpener && window.opener) {
        window.opener.postMessage(payload, window.location.origin)
        setMessage("Finishing sign-in…")
      } else {
        window.postMessage(payload, window.location.origin)
        setMessage("Returning to the app…")
      }
      setSent(true)
      return
    }

    const idToken = params.get("id_token")

    if (idToken && state && postedStates.has(state)) {
      setSent(true)
      return
    }

    if (!idToken || !state) {
      setStatus("error")
      setMessage("Missing Google sign-in credentials. You can close this tab and try again.")
      return
    }
    postedStates.add(state)

    const preview = decodeIdTokenPreview(idToken)
    if (preview) {
      setProfile(preview)
    }

    const payload = {
      type: "google-oauth-token" as const,
      idToken,
      state,
    }

    if (hasOpener && window.opener) {
      window.opener.postMessage(payload, window.location.origin)
      setMessage("Signing you in. Please keep this tab open for a moment…")
    } else {
      window.postMessage(payload, window.location.origin)
      setMessage("Completing sign-in… redirecting you back to the app.")
    }
    setSent(true)
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search)
  }, [params, hasOpener])

  // Escape hatch: if retry-interactive fired and window.location.replace never navigated
  // (iOS PWA limitation), we'd be stuck here forever. Bail out to landing page.
  useEffect(() => {
    if (!sent || status !== "pending") return
    const id = setTimeout(() => navigate("/", { replace: true }), 8000)
    return () => clearTimeout(id)
  }, [sent, status, navigate])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return
      const data = event.data
      if (!data || typeof data !== "object") return
      if (data.type !== "google-auth-complete") return

      if (data.success) {
        succeededRef.current = true
        setStatus("success")
        setMessage(
          data.message || (hasOpener ? "You’re signed in! This tab will close automatically." : "You’re signed in! Redirecting you back to the app."),
        )
        if (hasOpener) {
          window.close()
        } else {
          navigate(data.returnTo || "/", { replace: true })
        }
      } else {
        // A late failure after a success is a duplicate delivery, not a real error.
        if (succeededRef.current) return
        setStatus("error")
        setMessage(data.message || "We couldn’t finish signing you in. Please retry from the app.")
        if (!hasOpener) {
          window.setTimeout(() => {
            navigate(data.returnTo || "/", { replace: true })
          }, 900)
        }
      }
    }

    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [hasOpener, navigate])

  const heading = (() => {
    switch (status) {
      case "success":
        return "Google sign-in complete"
      case "error":
        return "Google sign-in failed"
      default:
        return "Completing Google sign-in"
    }
  })()

  const Icon = (() => {
    switch (status) {
      case "success":
        return CheckCircle2
      case "error":
        return XCircle
      default:
        return Loader2
    }
  })()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6 text-center">
      <div className="flex flex-col items-center gap-4 rounded-xl border border-border bg-card p-8 shadow-sm">
        <Icon className={`h-12 w-12 ${status === "success" ? "text-green-600" : status === "error" ? "text-red-600" : "animate-spin text-muted-foreground"}`} />
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{heading}</h1>
          <p className="text-sm text-muted-foreground">{message}</p>
          {profile && (
            <p className="text-sm">
              {profile.name && <span className="font-medium">{profile.name}</span>}
              {profile.name && profile.email && " · "}
              {profile.email}
            </p>
          )}
          {status === "pending" && sent && (
            <p className="text-xs text-muted-foreground">
              You can return to the original tab once it confirms the sign-in.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}

export default AuthCallbackPage

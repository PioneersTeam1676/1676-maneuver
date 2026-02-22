import { useAuth } from "@/contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react"
import { apiPut } from "@/lib/apiClient"

const POLL_INTERVAL_MS = 30_000

const AllianceOnboardingPage = () => {
  const { user, role, allowedAllianceDomain, defaultRoute, refreshRoles } = useAuth()
  const navigate = useNavigate()
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [checking, setChecking] = useState(false)
  const [registered, setRegistered] = useState(false)
  const prevRoleRef = useRef(role)

  // Redirect once approved
  useEffect(() => {
    if (role !== "pending") {
      if (prevRoleRef.current === "pending") {
        toast.success("You've been approved! Welcome to the scouting app.")
      }
      navigate(defaultRoute, { replace: true })
    }
    prevRoleRef.current = role
  }, [role, defaultRoute, navigate])

  // On mount: explicitly record this login in the DB so admins see the request
  useEffect(() => {
    if (!user) return
    apiPut(`/recent-users/${encodeURIComponent(user.email)}`, {
      email: user.email,
      firstSeenAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      acknowledged: false,
      displayName: user.name || undefined,
      photoUrl: user.picture || undefined,
    })
      .then(() => setRegistered(true))
      .catch(() => {
        // Silent — server may be offline; the login attempt was already recorded on sign-in
      })
  }, [user])

  // Poll for role approval every 30 seconds
  useEffect(() => {
    const check = async () => {
      setChecking(true)
      try {
        await refreshRoles()
        setLastChecked(new Date())
      } catch {
        // ignore
      } finally {
        setChecking(false)
      }
    }

    check()
    const id = setInterval(check, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refreshRoles])

  const handleManualCheck = async () => {
    setChecking(true)
    try {
      await refreshRoles()
      setLastChecked(new Date())
    } catch {
      toast.error("Could not reach the server. Try again shortly.")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="h-6 w-6" />
            Team 1676 Scouting Alliance
          </CardTitle>
          <CardDescription>
            Your sign-in request has been sent to an administrator. You'll be redirected automatically once approved.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              Accounts using the <Badge variant="outline" className="mx-1">@{allowedAllianceDomain}</Badge> domain are
              granted scouting access automatically. Others must wait for approval from a 1676 admin.
            </p>
          </div>

          <div className="space-y-1.5">
            <h2 className="text-sm font-semibold">Current status</h2>
            <ul className="space-y-1.5 text-sm">
              <li>
                <span className="font-medium text-foreground">Signed in as:</span>{" "}
                {user ? `${user.name} (${user.email})` : "Not signed in"}
              </li>
              <li>
                <span className="font-medium text-foreground">Access level:</span>{" "}
                <Badge variant="secondary">Pending approval</Badge>
              </li>
              {registered && (
                <li className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Request sent to verification center</span>
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleManualCheck} disabled={checking}>
              <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : "Check for approval"}
            </Button>
            {lastChecked && (
              <p className="text-xs text-muted-foreground">
                Last checked {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            This page checks automatically every 30 seconds. You can also leave this tab open and you'll be redirected
            the moment an admin approves your account.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default AllianceOnboardingPage

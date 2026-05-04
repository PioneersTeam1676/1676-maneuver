import { useAuth } from "@/contexts/AuthContext"
import { useNavigate } from "react-router-dom"
import { type FormEvent, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ShieldCheck, RefreshCw, CheckCircle2 } from "lucide-react"
import { syncEventSettings } from "@/lib/eventSettingsClient"

const POLL_INTERVAL_MS = 30_000

const AllianceOnboardingPage = () => {
  const {
    user,
    role,
    ready,
    defaultRoute,
    refreshRoles,
    recentUsers,
    allianceProfile,
    submitAllianceProfile,
  } = useAuth()
  const navigate = useNavigate()
  const [lastChecked, setLastChecked] = useState<Date | null>(null)
  const [checking, setChecking] = useState(false)
  const [firstName, setFirstName] = useState("")
  const [lastName, setLastName] = useState("")
  const [teamNumber, setTeamNumber] = useState("")
  const [profileSubmitted, setProfileSubmitted] = useState(false)
  const [profileSubmitting, setProfileSubmitting] = useState(false)
  const prevRoleRef = useRef(role)

  const recentUser = user
    ? recentUsers.find((record) => record.email === user.email.trim().toLowerCase())
    : undefined
  const savedFirstName = allianceProfile?.firstName || recentUser?.firstName || ""
  const savedLastName = allianceProfile?.lastName || recentUser?.lastName || ""
  const savedTeamNumber = allianceProfile?.teamNumber || recentUser?.teamNumber || ""
  const hasProfileDetails = Boolean(savedFirstName && savedLastName && savedTeamNumber)
  const requestSubmitted = role !== "blocked" && (hasProfileDetails || profileSubmitted)

  // Session expired while on this page — send to landing page so they can sign in again
  useEffect(() => {
    if (ready && !user) navigate('/', { replace: true })
  }, [ready, user, navigate])

  // Redirect once approved
  useEffect(() => {
    let cancelled = false
    if (role !== "pending" && role !== "blocked") {
      if (prevRoleRef.current === "pending" || prevRoleRef.current === "blocked") {
        toast.success("You've been approved! Welcome to the scouting app.")
        syncEventSettings()
          .catch(() => {})
          .finally(() => {
            if (!cancelled) navigate(defaultRoute, { replace: true })
          })
      } else {
        navigate(defaultRoute, { replace: true })
      }
    }
    prevRoleRef.current = role
    return () => { cancelled = true }
  }, [role, defaultRoute, navigate])

  useEffect(() => {
    if (!user) return
    const nameParts = user.name?.trim().split(/\s+/).filter(Boolean) ?? []
    setFirstName(savedFirstName || nameParts[0] || "")
    setLastName(savedLastName || (nameParts.length > 1 ? nameParts.slice(1).join(" ") : ""))
    setTeamNumber(savedTeamNumber)
  }, [savedFirstName, savedLastName, savedTeamNumber, user])

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

  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setProfileSubmitting(true)
    const result = await submitAllianceProfile({
      firstName,
      lastName,
      teamNumber,
      confirmedAlliance: true,
    }).finally(() => setProfileSubmitting(false))

    if (!result.success) {
      toast.error(result.message || "Could not save your profile details.")
      return
    }

    setProfileSubmitted(true)
    toast.success("Profile details saved for admin review.")
  }

  return (
    <div className="container mx-auto max-w-3xl space-y-6 px-4 py-8 sm:py-12">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-2xl">
            <ShieldCheck className="h-6 w-6" />
            Team 1676 Scouting Alliance
          </CardTitle>
          <CardDescription>
            {role === "blocked"
              ? "Your access has been revoked. Contact a Team 1676 admin if this account should be restored."
              : "Your sign-in request has been sent to an administrator. You'll be redirected automatically once approved."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {role !== "blocked" && !hasProfileDetails && !profileSubmitted && (
            <form className="space-y-4 rounded-md border bg-card p-4" onSubmit={handleProfileSubmit}>
              <div>
                <h2 className="text-base font-semibold">Tell us who you are</h2>
                <p className="text-sm text-muted-foreground">
                  Admins use this to verify your request and set your scouting display name.
                </p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    autoComplete="given-name"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    autoComplete="family-name"
                    required
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teamNumber">Team number</Label>
                <Input
                  id="teamNumber"
                  value={teamNumber}
                  onChange={(event) => setTeamNumber(event.target.value.replace(/[^0-9]/g, ""))}
                  inputMode="numeric"
                  autoComplete="off"
                  required
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto" disabled={profileSubmitting}>
                {profileSubmitting ? "Saving..." : "Save profile details"}
              </Button>
            </form>
          )}

          <div className="rounded-md border border-dashed border-muted-foreground/40 bg-muted/20 p-4 text-sm text-muted-foreground">
            <p>
              {role === "blocked"
                ? <>This account is currently blocked from scouting access. Refreshing will not submit a new approval request.</>
                : <>All accounts require approval from a Team 1676 admin before accessing the scouting app. You&apos;ll be redirected automatically once approved.</>}
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
                <Badge variant="secondary">{role === "blocked" ? "Access revoked" : "Pending approval"}</Badge>
              </li>
              {requestSubmitted && (
                <li className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Request sent to verification center</span>
                </li>
              )}
              {(hasProfileDetails || profileSubmitted) && role !== "blocked" && (
                <li className="flex items-center gap-1.5 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>
                    Profile saved as {`${firstName} ${lastName}`.trim()} for Team {teamNumber}
                  </span>
                </li>
              )}
            </ul>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Button variant="outline" size="sm" onClick={handleManualCheck} disabled={checking}>
              <RefreshCw className={`mr-2 h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              {checking ? "Checking…" : role === "blocked" ? "Check access status" : "Check for approval"}
            </Button>
            {lastChecked && (
              <p className="text-xs text-muted-foreground">
                Last checked {lastChecked.toLocaleTimeString()}
              </p>
            )}
          </div>

          <p className="text-xs text-muted-foreground">
            {role === "blocked"
              ? "This page checks automatically every 30 seconds in case an admin restores your access."
              : "This page checks automatically every 30 seconds. You can also leave this tab open and you'll be redirected the moment an admin approves your account."}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

export default AllianceOnboardingPage

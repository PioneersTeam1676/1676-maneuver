import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"

import { useAuth, type UserRole } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { VerificationStatus } from "@/components/ui/verification-status"
import { formatVerificationRecordName, hasCompletedOnboarding } from "@/lib/verificationRequest"

const matchesAllowedDomain = (email: string, domains: string[]) => {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return domains.some((domain) => domain && normalized.endsWith(`@${domain}`))
}

const roleLabels: Record<UserRole, string> = {
  blocked: "Blocked",
  pending: "Pending",
  pit_scout: "Pit Scout",
  drive_team: "Drive Team",
  scout_minus: "Scout −",
  scout: "Scout",
  scout_plus: "Scout +",
  lead: "Lead",
  tech_lead: "Technical Lead",
}

export default function VerificationCenterPage() {
  const {
    user,
    isLead,
    recentUsers,
    roleAssignments,
    allowedAllianceDomains,
    acknowledgeRecentUser,
    setRole,
    removeAllianceProfile,
    resetVerification,
    refreshRecentUsers,
    refreshRoles,
  } = useAuth()
  const navigate = useNavigate()
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!isLead) return
    void refreshRecentUsers().catch(() => {})
    void refreshRoles().catch(() => {})
  }, [isLead, refreshRecentUsers, refreshRoles])

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      await Promise.all([refreshRecentUsers(), refreshRoles()])
    } catch {
      // errors already logged in context
    } finally {
      setRefreshing(false)
    }
  }

  const allowedDomains = allowedAllianceDomains.filter(Boolean)

  const pendingRecords = useMemo(() => {
    if (!isLead) return []

    type PendingRecord = {
      email: string
      firstSeenAt: string
      lastSeenAt: string
      acknowledged: boolean
      displayName: string | null
      photoUrl: string | null
      firstName: string | null
      lastName: string | null
      teamNumber: string | null
      assignedRole: UserRole
    }

    const recordsByEmail = new Map<string, PendingRecord>()
    const normalize = (value: string) => value.trim().toLowerCase()

    recentUsers.forEach((record) => {
      const email = normalize(record.email)
      const assignedRole = (roleAssignments[email] ?? "pending") as UserRole
      if (assignedRole !== "pending") {
        return
      }
      recordsByEmail.set(email, {
        email,
        firstSeenAt: record.firstSeenAt,
        lastSeenAt: record.lastSeenAt,
        acknowledged: Boolean(record.acknowledged),
        displayName: record.displayName ?? null,
        photoUrl: record.photoUrl ?? null,
        firstName: record.firstName ?? null,
        lastName: record.lastName ?? null,
        teamNumber: record.teamNumber ?? null,
        assignedRole: "pending",
      })
    })

    Object.entries(roleAssignments).forEach(([rawEmail, assignedRole]) => {
      if (assignedRole !== "pending") return
      const email = normalize(rawEmail)
      const existing = recordsByEmail.get(email)
      if (existing) {
        recordsByEmail.set(email, { ...existing, assignedRole: "pending" })
        return
      }
      const timestamp = new Date().toISOString()
      recordsByEmail.set(email, {
        email,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        acknowledged: false,
        displayName: null,
        photoUrl: null,
        firstName: null,
        lastName: null,
        teamNumber: null,
        assignedRole: "pending",
      })
    })

    return Array.from(recordsByEmail.values())
      .filter((record) => {
        const isAllowed = matchesAllowedDomain(record.email, allowedDomains)
        return !record.acknowledged && record.assignedRole === "pending" && !isAllowed && hasCompletedOnboarding(record)
      })
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }, [isLead, recentUsers, roleAssignments, allowedDomains])

  const recentlyCleared = useMemo(() => {
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoISO = sevenDaysAgo.toISOString()

    return recentUsers
      .map((record) => ({
        ...record,
        assignedRole: (roleAssignments[record.email] ?? "pending") as UserRole,
      }))
      .filter((record) => {
        const isAllowed = matchesAllowedDomain(record.email, allowedDomains)
        // Show acknowledged records with assigned roles from the past 7 days
        return record.acknowledged && 
               record.assignedRole !== "pending" &&
               record.assignedRole !== "blocked" &&
               !isAllowed &&
               record.lastSeenAt >= sevenDaysAgoISO
      })
      .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }, [recentUsers, roleAssignments, allowedDomains])

  if (!user) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Use Google sign-in from the sidebar before reviewing verification requests.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!isLead) {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6 p-6">
        <Card>
          <CardHeader>
            <CardTitle>Restricted access</CardTitle>
            <CardDescription>
              Only leads and admins can review external sign-in requests. If you believe this is a mistake, contact an admin.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={() => navigate(-1)}>Go back</Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const handleApprove = (email: string) => {
    setRole(email, "scout")
    acknowledgeRecentUser(email)
    toast.success(`Granted Scout access to ${email}`)
  }

  const handleDismiss = (email: string) => {
    acknowledgeRecentUser(email)
    toast(`Dismissed verification request for ${email}`)
  }

  const handleDeny = (email: string) => {
    // Remove any submitted alliance profile and block the account from re-requesting on refresh.
    removeAllianceProfile(email)
    setRole(email, "blocked")
    acknowledgeRecentUser(email)
    toast.error(`Denied access for ${email}`)
  }

  const handleRevoke = (email: string) => {
    setRole(email, "blocked")
    toast.error(`Revoked access for ${email}`)
  }

  const handleReset = (email: string) => {
    resetVerification(email)
    toast.success(`Reset onboarding for ${email}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-4 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Verification Center</h1>
          <p className="text-muted-foreground">
            Review Google sign-ins from outside the scouting domain. Approve them when you confirm their identity so they can access the platform.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="w-full shrink-0 sm:mt-1 sm:w-auto">
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Pending approvals</CardTitle>
          <CardDescription>{pendingRecords.length === 0 ? "No outstanding requests." : `${pendingRecords.length} request${pendingRecords.length === 1 ? '' : 's'} awaiting your review.`}</CardDescription>
        </CardHeader>
        <CardContent>
          {pendingRecords.length === 0 ? (
            <div className="rounded-md border border-dashed border-border/60 bg-muted/20 p-6 text-sm text-muted-foreground">
              Once someone finishes onboarding with a non-alliance email, you&apos;ll see them here for quick approval.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRecords.map((record) => {
                const assignedRole = record.assignedRole
                const displayName = formatVerificationRecordName(record)
                const initials = (displayName.split(' ').map((part: string) => part[0]) ?? []).join('').slice(0, 2) || record.email[0]?.toUpperCase() || "?"
                return (
                  <div key={record.email} className="flex flex-col gap-4 rounded-lg border border-border bg-card p-3 shadow-sm sm:p-4 md:flex-row md:items-center md:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <Avatar className="h-11 w-11 shrink-0 sm:h-12 sm:w-12">
                        <AvatarImage src={record.photoUrl ?? undefined} alt={displayName} referrerPolicy="no-referrer" />
                        <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex min-w-0 flex-col gap-1">
                        <span className="font-semibold">{displayName}</span>
                        <span className="break-all font-mono text-sm text-muted-foreground">{record.email}</span>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span>Last seen: {new Date(record.lastSeenAt).toLocaleString()}</span>
                          {record.teamNumber && <Badge variant="outline">Team {record.teamNumber}</Badge>}
                          <VerificationStatus
                            value={assignedRole !== "pending"}
                            yesLabel="Verified"
                            noLabel="Pending"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap sm:items-center sm:justify-end">
                      <Badge variant="secondary" className="justify-center px-3 py-1 sm:inline-flex">Scout</Badge>
                      <Button size="sm" onClick={() => handleApprove(record.email)} className="px-4">
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDismiss(record.email)} className="px-4">
                        Dismiss
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleReset(record.email)} className="px-4">
                        Reset
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDeny(record.email)} className="px-4">
                        Deny
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {recentlyCleared.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recent approvals</CardTitle>
            <CardDescription>External accounts approved in the past 7 days. Reset clears onboarding so they can resubmit the next time they visit.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentlyCleared.map((record) => {
              const assignedRole = (roleAssignments[record.email] ?? "pending") as UserRole
              const displayName = formatVerificationRecordName(record)
              return (
                <div key={record.email} className="flex flex-col gap-3 rounded-md border border-border/60 bg-card/80 p-3 sm:p-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex min-w-0 items-start gap-3">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={record.photoUrl} alt={displayName} referrerPolicy="no-referrer" />
                      <AvatarFallback>
                        {displayName.split(' ').map((part) => part[0]).join('').slice(0, 2) || record.email[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="font-medium">{displayName}</span>
                      <span className="break-all font-mono text-xs text-muted-foreground">{record.email}</span>
                      {record.teamNumber && <span className="text-xs text-muted-foreground">Team {record.teamNumber}</span>}
                      <VerificationStatus
                        value={assignedRole !== "pending"}
                        yesLabel={roleLabels[assignedRole]}
                        noLabel="Pending"
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <span className="text-xs text-muted-foreground">{new Date(record.lastSeenAt).toLocaleString()}</span>
                    <Button size="sm" variant="outline" onClick={() => handleReset(record.email)} className="w-full sm:w-auto">
                      Reset
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleRevoke(record.email)} className="w-full sm:w-auto">
                      Revoke access
                    </Button>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

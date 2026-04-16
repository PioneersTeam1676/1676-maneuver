import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"

import { useAuth, type UserRole } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { VerificationStatus } from "@/components/ui/verification-status"

const matchesAllowedDomain = (email: string, domains: string[]) => {
  if (!email) return false
  const normalized = email.trim().toLowerCase()
  return domains.some((domain) => domain && normalized.endsWith(`@${domain}`))
}

const roleLabels: Record<UserRole, string> = {
  pending: "Pending",
  pit_scout: "Pit Scout",
  drive_team: "Drive Team",
  scout_minus: "Scout −",
  scout: "Scout",
  scout_plus: "Scout +",
  lead: "Lead",
  tech_lead: "Technical Lead",
}

type ApproveRole = Exclude<UserRole, "pending"> | "pending"

export default function VerificationCenterPage() {
  const {
    user,
    isLead,
    isAdmin,
    recentUsers,
    roleAssignments,
    allowedAllianceDomains,
    acknowledgeRecentUser,
    setRole,
    removeRole,
    removeAllianceProfile,
    refreshRecentUsers,
    refreshRoles,
  } = useAuth()
  const navigate = useNavigate()
  const [roleSelections, setRoleSelections] = useState<Record<string, ApproveRole>>({})
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
      assignedRole: UserRole
    }

    const recordsByEmail = new Map<string, PendingRecord>()
    const normalize = (value: string) => value.trim().toLowerCase()

    recentUsers.forEach((record) => {
      const email = normalize(record.email)
      const assignedRole = roleAssignments[email]
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
        assignedRole: "pending",
      })
    })

    return Array.from(recordsByEmail.values())
      .filter((record) => {
        const isAllowed = matchesAllowedDomain(record.email, allowedDomains)
        return !record.acknowledged && record.assignedRole === "pending" && !isAllowed
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

  const handleRoleSelection = (email: string, role: ApproveRole) => {
    setRoleSelections((prev) => ({
      ...prev,
      [email]: role,
    }))
  }

  const handleApprove = (email: string) => {
    const selectedRole = roleSelections[email] ?? "scout"

    if (selectedRole === "pending") {
      acknowledgeRecentUser(email)
      toast.success(`Marked ${email} as reviewed.`)
      return
    }

    if (!isAdmin && selectedRole !== "scout") {
      toast.error("Only admins can assign lead or admin roles.")
      return
    }

    setRole(email, selectedRole as Exclude<UserRole, "pending">)
    acknowledgeRecentUser(email)
    toast.success(`Granted ${roleLabels[selectedRole as UserRole]} access to ${email}`)
  }

  const handleDismiss = (email: string) => {
    acknowledgeRecentUser(email)
    toast(`Dismissed verification request for ${email}`)
  }

  const handleDeny = (email: string) => {
    // Remove any submitted alliance profile and role assignment, and mark as reviewed
    removeAllianceProfile(email)
    removeRole(email)
    acknowledgeRecentUser(email)
    toast.error(`Denied and deleted account for ${email}`)
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Verification Center</h1>
          <p className="text-muted-foreground">
            Review Google sign-ins from outside the scouting domain. Approve them when you confirm their identity so they can access the platform.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={refreshing} className="shrink-0 mt-1">
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
              Once someone signs in with a non-alliance email, you&apos;ll see them here for quick approval.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingRecords.map((record) => {
                const roleValue = roleSelections[record.email] ?? "scout"
                const assignedRole = record.assignedRole
                const initials = (record.displayName?.split(' ').map((part: string) => part[0]) ?? []).join('').slice(0, 2) || record.email[0]?.toUpperCase() || "?"
                return (
                  <div key={record.email} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm md:flex-row md:items-center md:justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-12 w-12">
                        <AvatarImage src={record.photoUrl ?? undefined} alt={record.displayName ?? record.email} referrerPolicy="no-referrer" />
                        <AvatarFallback className="text-sm">{initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col gap-1">
                        <span className="font-semibold">{record.displayName || "Unknown user"}</span>
                        <span className="text-sm font-mono text-muted-foreground">{record.email}</span>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>Last seen: {new Date(record.lastSeenAt).toLocaleString()}</span>
                          <VerificationStatus
                            value={assignedRole !== "pending"}
                            yesLabel="Verified"
                            noLabel="Pending"
                          />
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {isAdmin ? (
                        <Select value={roleValue} onValueChange={(val) => handleRoleSelection(record.email, val as ApproveRole)}>
                          <SelectTrigger className="w-[130px]">
                            <SelectValue placeholder="Choose role" />
                          </SelectTrigger>
                          <SelectContent>
                          <SelectItem value="pit_scout">Pit Scout</SelectItem>
                          <SelectItem value="drive_team">Drive Team</SelectItem>
                          <SelectItem value="scout">Scout</SelectItem>
                          <SelectItem value="lead">Lead</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="secondary" className="px-3 py-1">Scout</Badge>
                      )}
                      <Button size="sm" onClick={() => handleApprove(record.email)} className="px-4">
                        Approve
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDismiss(record.email)} className="px-4">
                        Dismiss
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
            <CardDescription>External accounts approved in the past 7 days.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {recentlyCleared.map((record) => {
              const assignedRole = (roleAssignments[record.email] ?? "pending") as UserRole
              return (
                <div key={record.email} className="flex items-center justify-between rounded-md border border-border/60 bg-card/80 p-4">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={record.photoUrl} alt={record.displayName ?? record.email} referrerPolicy="no-referrer" />
                      <AvatarFallback>
                        {record.displayName?.split(' ').map((part) => part[0]).join('').slice(0, 2) || record.email[0]?.toUpperCase() || "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="font-medium">{record.displayName || record.email}</span>
                      <VerificationStatus
                        value={assignedRole !== "pending"}
                        yesLabel={roleLabels[assignedRole]}
                        noLabel="Pending"
                        className="text-xs text-muted-foreground"
                      />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">{new Date(record.lastSeenAt).toLocaleString()}</span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

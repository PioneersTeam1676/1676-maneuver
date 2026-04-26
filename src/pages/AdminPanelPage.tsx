import { useMemo, useState } from "react"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useAuth, type UserRole } from "@/contexts/AuthContext"
import { VerificationStatus } from "@/components/ui/verification-status"
import { toast } from "sonner"
import { sendManualNotification } from "@/lib/pushNotifications"
import { clearAllScoutingData } from "@/lib/dexieDB"

const ROLE_OPTIONS: Array<Exclude<UserRole, "pending">> = ["blocked", "pit_scout", "drive_team", "scout_minus", "scout", "scout_plus", "lead", "tech_lead"]

const roleLabels: Record<UserRole, string> = {
  blocked: "Blocked",
  pending: "Pending approval",
  pit_scout: "Pit Scout",
  drive_team: "Drive Team",
  scout_minus: "Scout −",
  scout: "Scout",
  scout_plus: "Scout +",
  lead: "Lead",
  tech_lead: "Technical Lead",
}

const formatTimestamp = (isoString?: string) => {
  if (!isoString) return "—"
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) {
    return isoString
  }
  return parsed.toLocaleString()
}

export default function AdminPanelPage() {
  const {
    user,
    role,
    isUltraAdmin,
    roleAssignments,
    setRole,
    recentUsers,
    allianceProfiles,
    allowedAllianceDomain,
    allowedAllianceDomains,
    acknowledgeRecentUser,
  } = useAuth()

  const [email, setEmail] = useState("")
  const [selectedRole, setSelectedRole] = useState<Exclude<UserRole, "pending">>("scout")
  const [notificationEmail, setNotificationEmail] = useState("")
  const [notificationTitle, setNotificationTitle] = useState("Scouting update")
  const [notificationMessage, setNotificationMessage] = useState("")
  const [notificationUrl, setNotificationUrl] = useState("/")
  const [sendingNotification, setSendingNotification] = useState(false)
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false)
  const [clearingEntries, setClearingEntries] = useState(false)

  const allowedDomainLabel = useMemo(() => {
    const domainSet = new Set<string>()
    if (allowedAllianceDomain) domainSet.add(allowedAllianceDomain)
    for (const d of allowedAllianceDomains) if (d) domainSet.add(d)
    const domains = Array.from(domainSet)
    if (domains.length === 0) return "@pascack.org"
    if (domains.length === 1) return `@${domains[0]}`
    return domains.map((d) => `@${d}`).join(" or ")
  }, [allowedAllianceDomain, allowedAllianceDomains])

  const assignments = useMemo(
    () =>
      Object.entries(roleAssignments)
        .map(([addr, assignedRole]) => ({ email: addr, assignedRole }))
        .sort((a, b) => a.email.localeCompare(b.email)),
    [roleAssignments]
  )

  const knownNotificationTargets = useMemo(() => assignments.map((a) => a.email), [assignments])
  const normalizedNotificationEmail = notificationEmail.trim().toLowerCase()
  const rosterSelectValue = knownNotificationTargets.includes(normalizedNotificationEmail)
    ? normalizedNotificationEmail
    : ""

  const adminCount = assignments.filter((x) => x.assignedRole === "lead" || x.assignedRole === "tech_lead").length

  const recentUsersWithRoles = useMemo(
    () =>
      recentUsers
        .map((r) => ({ ...r, assignedRole: (roleAssignments[r.email] ?? "pending") as UserRole }))
        .sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
    [recentUsers, roleAssignments]
  )

  // Only show unacknowledged pending sign-ins
  const pendingSignIns = recentUsersWithRoles.filter((r) => r.assignedRole === "pending" && !r.acknowledged)

  const allianceRequests = useMemo(
    () =>
      Object.values(allianceProfiles)
        .map((p) => ({ 
          ...p, 
          assignedRole: (roleAssignments[p.email] ?? "pending") as UserRole, 
          lastActiveAt: p.lastSeenAt ?? p.submittedAt 
        }))
        .sort((a, b) => b.lastActiveAt.localeCompare(a.lastActiveAt)),
    [allianceProfiles, roleAssignments]
  )

  // Exclude denied/dismissed users from alert count using recentUsers acknowledgments
  const acknowledgedEmails = useMemo(() => new Set(recentUsers.filter((u) => u.acknowledged).map((u) => u.email)), [recentUsers])
  const pendingAllianceRequests = allianceRequests.filter((r) => r.assignedRole === "pending" && !acknowledgedEmails.has(r.email))

  if (!user) {
    return (
      <div className="container mx-auto max-w-3xl py-10">
        <Card>
          <CardHeader>
            <CardTitle>Sign in required</CardTitle>
            <CardDescription>Use Google sign-in from the sidebar to manage roles.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    )
  }

  if (!isUltraAdmin) {
    return (
      <div className="container mx-auto max-w-3xl space-y-4 py-10">
        <Card>
          <CardHeader>
            <CardTitle>Admin access needed</CardTitle>
            <CardDescription>
              Your current role is <strong>{roleLabels[role]}</strong>. Ask an ultra admin to promote your account if you need to manage team access.
            </CardDescription>
          </CardHeader>
        </Card>
        <Alert>
          <AlertTitle>Why no Google client secret?</AlertTitle>
          <AlertDescription>
            Google Identity Services only uses the OAuth client ID inside this PWA. Client secrets must remain on a secure server and are not required for our front-end flow.
          </AlertDescription>
        </Alert>
      </div>
    )
  }

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    const trimmed = email.trim().toLowerCase()
    if (!trimmed) {
      toast.error("Enter an email address before saving.")
      return
    }
    setRole(trimmed, selectedRole)
    setEmail("")
    toast.success(`Granted ${roleLabels[selectedRole]} access to ${trimmed}`)
  }

  const handleRoleUpdate = (addr: string, current: UserRole, next: Exclude<UserRole, "pending">) => {
    if (current === "tech_lead") {
      toast.error("Technical Lead role cannot be changed.")
      return
    }
    const isAdminRole = (r: string) => r === "lead" || r === "tech_lead"
    if (isAdminRole(current) && !isAdminRole(next) && adminCount <= 1) {
      toast.error("Add another lead before demoting this account.")
      return
    }
    setRole(addr, next)
    toast.success(`Updated ${addr} to ${roleLabels[next]}`)
  }

  const handleRemove = (addr: string, current: UserRole) => {
    if (current === "tech_lead") {
      toast.error("Technical Lead cannot be removed.")
      return
    }
    const isAdminRole = (r: string) => r === "lead" || r === "tech_lead"
    if (isAdminRole(current) && adminCount <= 1) {
      toast.error("Add another lead before removing this account.")
      return
    }
    setRole(addr, "blocked")
    toast.success(`Revoked access for ${addr}`)
  }

  const handleSendNotification = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
  const emailTarget = normalizedNotificationEmail
    const title = notificationTitle.trim()
    const message = notificationMessage.trim()
    const url = notificationUrl.trim()

    if (!emailTarget) {
      toast.error("Pick a scout email before sending a notification.")
      return
    }
    if (!message) {
      toast.error("Add a message before sending.")
      return
    }

    setSendingNotification(true)
    try {
      await sendManualNotification({
        email: emailTarget,
        title: title || undefined,
        body: message,
        url: url || undefined,
      })
      toast.success("Notification sent.")
      setNotificationMessage("")
    } catch (error) {
      console.warn("Failed to send manual notification", error)
      toast.error("Could not deliver the notification. Confirm the scout has push enabled.")
    } finally {
      setSendingNotification(false)
    }
  }

  const handleClearEntries = async () => {
    setClearingEntries(true)
    try {
      await clearAllScoutingData()
      toast.success("Deleted all scouting entries.")
    } catch (error) {
      console.error("Failed to clear scouting entries", error)
      toast.error("Failed to delete scouting entries.")
    } finally {
      setClearingEntries(false)
      setClearConfirmOpen(false)
    }
  }

  return (
    <div className="container mx-auto max-w-5xl space-y-6 py-10">
      <div>
        <h1 className="text-3xl font-bold">Admin Panel</h1>
        <p className="text-muted-foreground">Manage Google sign-in permissions, approve alliance requests, and keep admins in the loop.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Google sign-ins</CardTitle>
          <CardDescription>Accounts that have authenticated but still need approval.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {pendingSignIns.length === 0 ? (
            <p className="text-sm text-muted-foreground">No new sign-ins awaiting approval.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>First seen</TableHead>
                  <TableHead>Last seen</TableHead>
                  <TableHead>Reviewed</TableHead>
                  <TableHead className="text-right">Quick actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingSignIns.map((r) => (
                  <TableRow key={r.email} className={!r.acknowledged ? "bg-muted/40" : undefined}>
                    <TableCell className="font-medium">
                      <div className="flex flex-col">
                        <span>{r.displayName || "Unknown scout"}</span>
                        {!r.acknowledged && <span className="text-xs text-muted-foreground">New sign-in</span>}
                      </div>
                    </TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTimestamp(r.firstSeenAt)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatTimestamp(r.lastSeenAt)}</TableCell>
                    <TableCell>
                      <VerificationStatus
                        value={Boolean(r.acknowledged)}
                        yesLabel="Reviewed"
                        noLabel="Waiting"
                      />
                    </TableCell>
                    <TableCell className="space-x-2 text-right">
                      <Button size="sm" onClick={() => setRole(r.email, "scout")}>Grant scout</Button>
                      <Button size="sm" variant="outline" onClick={() => acknowledgeRecentUser(r.email)}>Mark reviewed</Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Alliance confirmations</CardTitle>
          <CardDescription>Scouts outside <strong>{allowedDomainLabel}</strong> submit their details here. Approve requests once team information is verified.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {allianceRequests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No confirmation forms have been submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scout</TableHead>
                  <TableHead>Team</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Last touch</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {allianceRequests.map((req) => (
                  <TableRow key={req.email} className={req.assignedRole === "pending" ? "bg-muted/30" : undefined}>
                    <TableCell className="font-medium">{`${req.firstName || ''} ${req.lastName || ''}`.trim() || req.email}</TableCell>
                    <TableCell>#{req.teamNumber}</TableCell>
                    <TableCell>{req.email}</TableCell>
                    <TableCell>
                      <VerificationStatus
                        value={req.assignedRole !== "pending"}
                        yesLabel={roleLabels[req.assignedRole]}
                        noLabel="Pending"
                      />
                    </TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">{formatTimestamp(req.lastActiveAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {pendingAllianceRequests.length > 0 && (
            <Alert>
              <AlertTitle>{pendingAllianceRequests.length} request{pendingAllianceRequests.length === 1 ? "" : "s"} awaiting approval</AlertTitle>
              <AlertDescription>Assign roles to these accounts after confirming their alliance details to unlock scouting permissions.</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Add or update team members</CardTitle>
          <CardDescription>Assign roles to emails so the UI unlocks the correct tools.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-[2fr_1fr_auto]" onSubmit={handleSubmit}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email address</Label>
              <Input id="email" type="email" placeholder="scout@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role">Role</Label>
              <Select value={selectedRole} onValueChange={(v) => setSelectedRole(v as Exclude<UserRole, "pending">)}>
                <SelectTrigger id="role" className="w-full">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>{roleLabels[opt]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full">Save</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Send a push notification</CardTitle>
          <CardDescription>Ping a scout’s device with a custom alert.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4" onSubmit={handleSendNotification}>
            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="notification-email">Scout email</Label>
                <Input
                  id="notification-email"
                  type="email"
                  placeholder="scout@example.com"
                  value={notificationEmail}
                  onChange={(event) => setNotificationEmail(event.target.value)}
                  required
                />
              </div>
              {knownNotificationTargets.length > 0 && (
                <div className="space-y-1.5">
                  <Label>Select from roster</Label>
                  <Select value={rosterSelectValue} onValueChange={(value) => setNotificationEmail(value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Quick pick" />
                    </SelectTrigger>
                    <SelectContent>
                      {knownNotificationTargets.map((addr) => (
                        <SelectItem key={addr} value={addr}>
                          {addr}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>

            <div className="grid gap-2 sm:grid-cols-[2fr_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="notification-title">Title</Label>
                <Input
                  id="notification-title"
                  value={notificationTitle}
                  onChange={(event) => setNotificationTitle(event.target.value)}
                  placeholder="Scouting update"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="notification-url">Open URL</Label>
                <Input
                  id="notification-url"
                  value={notificationUrl}
                  onChange={(event) => setNotificationUrl(event.target.value)}
                  placeholder="/game-start"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notification-message">Message</Label>
              <Textarea
                id="notification-message"
                value={notificationMessage}
                onChange={(event) => setNotificationMessage(event.target.value)}
                placeholder="Reminder: you’re on Red 2 in Match 42."
                rows={3}
                required
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" disabled={sendingNotification}>
                {sendingNotification ? "Sending…" : "Send notification"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Approved accounts</CardTitle>
          <CardDescription>Adjust roles here. Revoke access blocks the account and keeps it from re-requesting access on refresh.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {assignments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">No assigned roles yet.</TableCell>
                </TableRow>
              ) : (
                assignments.map(({ email: addr, assignedRole }) => (
                  <TableRow key={addr}>
                    <TableCell className="font-medium">{addr}</TableCell>
                    <TableCell>
                      <Select 
                        value={assignedRole} 
                        onValueChange={(v) => handleRoleUpdate(addr, assignedRole, v as Exclude<UserRole, "pending">)}
                        disabled={assignedRole === "tech_lead"}
                      >
                        <SelectTrigger className="w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLE_OPTIONS.map((opt) => (
                            <SelectItem key={opt} value={opt}>{roleLabels[opt]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        onClick={() => handleRemove(addr, assignedRole)} 
                        disabled={
                          assignedRole === "tech_lead" ||
                          (assignedRole === "lead" && adminCount <= 1)
                        }
                      >
                        Revoke access
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
            <TableCaption>Admins can promote themselves or other leads at any time.</TableCaption>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
          <CardDescription>High-impact actions that cannot be undone.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Delete all scouting entries</p>
            <p className="text-sm text-muted-foreground">
              Clears every row in <code>scouting_entries</code> for the active season.
            </p>
          </div>
          <Button variant="destructive" onClick={() => setClearConfirmOpen(true)}>
            Delete all entries
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={clearConfirmOpen} onOpenChange={setClearConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete all scouting entries?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove every row from the scouting entries table for the active season.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={clearingEntries}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleClearEntries} disabled={clearingEntries}>
              {clearingEntries ? "Deleting…" : "Delete everything"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Card>
        <CardHeader>
          <CardTitle>Recent Google sign-ins</CardTitle>
          <CardDescription>Track who has authenticated recently and confirm their access level.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {recentUsersWithRoles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No Google sign-ins recorded.</p>
          ) : (
            recentUsersWithRoles.map((rec) => (
              <div key={rec.email} className="flex flex-col gap-2 rounded-md border border-border/60 bg-muted/20 px-3 py-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">{rec.displayName || rec.email}</p>
                  <p className="text-xs text-muted-foreground">{rec.email}</p>
                  <p className="text-xs text-muted-foreground">Last seen {formatTimestamp(rec.lastSeenAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={rec.assignedRole === "pending" ? "outline" : "secondary"}>{roleLabels[rec.assignedRole]}</Badge>
                  <VerificationStatus
                    value={Boolean(rec.acknowledged)}
                    yesLabel="Reviewed"
                    noLabel="New"
                  />
                  {!rec.acknowledged && (
                    <Button size="sm" variant="ghost" onClick={() => acknowledgeRecentUser(rec.email)}>Dismiss</Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  )
}

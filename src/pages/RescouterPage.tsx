import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient"
import { loadAllScoutingEntries } from "@/lib/dexieDB"
import { findMissingMatches, type MissingMatch } from "@/lib/missingMatchUtils"
import { getMatch, resolveTbaApiKey } from "@/lib/tbaUtils"
import { STORAGE_EVENT_NAME_KEY } from "@/lib/eventSettingsClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { ClipboardCheck, RefreshCw, UserPlus, X, Youtube } from "lucide-react"

interface ActiveClaim {
  id: number
  matchNumber: string
  alliance: string
  position: string
  eventKey: string
  scoutEmail: string
  scoutName: string
}

interface RescoutAssignment {
  id: number
  eventKey: string
  matchNumber: string
  alliance: string
  position: string
  originalScout: string
  assigneeEmail: string
  assigneeName: string
  assignedByEmail: string
  note: string | null
  assignedAt: string
}

interface AssigneeOption {
  email: string
  label: string
}

interface PushSubscriptionStatus {
  subscriptionCount: number
  hasSubscription: boolean
}

const HEARTBEAT_MS = 30_000
const RESCOUTER_DEFAULT_ROLES = new Set(["scout_plus", "lead", "tech_lead"])

const getSlotKey = (eventKey: string, matchNumber: string, position: string) =>
  `${eventKey}::${matchNumber}::${position}`

export default function RescouterPage() {
  const {
    user,
    canRescout,
    isUltraAdmin,
    recentUsers,
    roleAssignments,
    rescouterPermissions,
  } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [assigning, setAssigning] = useState(false)
  const [missing, setMissing] = useState<MissingMatch[]>([])
  const [claims, setClaims] = useState<ActiveClaim[]>([])
  const [assignments, setAssignments] = useState<RescoutAssignment[]>([])
  const [videoKeys, setVideoKeys] = useState<Record<string, string>>({})
  const [myClaimId, setMyClaimId] = useState<number | null>(null)
  const [selectedKeys, setSelectedKeys] = useState<string[]>([])
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [selectedAssigneeEmail, setSelectedAssigneeEmail] = useState("")
  const [assignmentNote, setAssignmentNote] = useState("")
  const [pushStatuses, setPushStatuses] = useState<Record<string, PushSubscriptionStatus>>({})
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const eventKey = useMemo(() => localStorage.getItem(STORAGE_EVENT_NAME_KEY) ?? "", [])
  const myEmail = user?.email?.trim().toLowerCase() ?? ""

  const recentUserMap = useMemo(() => {
    const map = new Map<string, { displayName?: string }>()
    for (const recentUser of recentUsers) {
      map.set(recentUser.email.trim().toLowerCase(), { displayName: recentUser.displayName })
    }
    return map
  }, [recentUsers])

  const assigneeOptions = useMemo<AssigneeOption[]>(() => {
    const allEmails = new Set<string>([
      ...Object.keys(roleAssignments),
      ...Object.keys(rescouterPermissions),
      ...recentUsers.map((entry) => entry.email.trim().toLowerCase()),
    ])

    return [...allEmails]
      .filter((email) => {
        if (!email) return false
        if (email in rescouterPermissions) return rescouterPermissions[email]
        const role = roleAssignments[email]
        return typeof role === "string" && RESCOUTER_DEFAULT_ROLES.has(role)
      })
      .map((email) => ({
        email,
        label: recentUserMap.get(email)?.displayName?.trim() || email,
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [recentUserMap, recentUsers, rescouterPermissions, roleAssignments])

  const assigneeOptionMap = useMemo(
    () => new Map(assigneeOptions.map((option) => [option.email, option])),
    [assigneeOptions]
  )
  const selectedAssigneePushStatus = selectedAssigneeEmail ? pushStatuses[selectedAssigneeEmail] : undefined

  const selectedKeySet = useMemo(() => new Set(selectedKeys), [selectedKeys])

  const assignmentBySlot = useMemo(() => {
    const map = new Map<string, RescoutAssignment>()
    for (const assignment of assignments) {
      map.set(getSlotKey(assignment.eventKey, assignment.matchNumber, assignment.position), assignment)
    }
    return map
  }, [assignments])

  const selectedMatches = useMemo(
    () =>
      missing.filter((match) =>
        selectedKeySet.has(getSlotKey(match.eventKey, match.matchNumber, match.position))
      ),
    [missing, selectedKeySet]
  )

  const fetchClaims = useCallback(async () => {
    try {
      const data = await apiGet<{ claims: ActiveClaim[] }>("/rescout/claims")
      setClaims(data.claims ?? [])
    } catch {
      // non-critical
    }
  }, [])

  const fetchAssignments = useCallback(async () => {
    if (!eventKey) {
      setAssignments([])
      return
    }

    try {
      const data = await apiGet<{ assignments: RescoutAssignment[] }>(
        `/rescout/assignments?eventKey=${encodeURIComponent(eventKey)}`
      )
      setAssignments(data.assignments ?? [])
    } catch {
      // non-critical
    }
  }, [eventKey])

  const loadMissing = useCallback(async () => {
    setLoading(true)
    try {
      const entries = await loadAllScoutingEntries()
      const existingKeys = new Set<string>()
      let latestMatchNum = 0
      for (const entry of entries) {
        if (!entry.matchNumber || !entry.teamNumber) continue
        const norm = entry.matchNumber.replace(/\D/g, "")
        existingKeys.add(`${norm}::${entry.teamNumber}`)
        const n = parseInt(norm, 10)
        if (Number.isFinite(n) && n > latestMatchNum) latestMatchNum = n
      }

      const { missing: found, usedTba } = await findMissingMatches({
        eventKey,
        existingKeys,
        latestMatchNum,
      })
      setMissing(found)

      if (found.length === 0) {
        toast.success(`All assigned matches have entries (via ${usedTba ? "TBA" : "schedule"})`)
      } else {
        toast.info(`${found.length} missing ${found.length === 1 ? "entry" : "entries"}`)
      }

      if (eventKey && resolveTbaApiKey()) {
        const uniqueMatchNums = [...new Set(found.map((match) => match.matchNumNormalized))]
        const keys: Record<string, string> = {}
        await Promise.allSettled(
          uniqueMatchNums.map(async (num) => {
            try {
              const matchKey = `${eventKey}_qm${num}`
              const match = await getMatch(matchKey)
              const ytVideo = match.videos?.find((video) => video.type === "youtube")
              if (ytVideo) keys[num] = ytVideo.key
            } catch {
              // no video for this match
            }
          })
        )
        setVideoKeys(keys)
      }

      await Promise.all([fetchClaims(), fetchAssignments()])
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load missing matches"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [eventKey, fetchAssignments, fetchClaims])

  useEffect(() => {
    void loadMissing()
  }, [loadMissing])

  useEffect(() => {
    const id = setInterval(() => {
      void Promise.all([fetchClaims(), fetchAssignments()])
    }, 15_000)
    return () => clearInterval(id)
  }, [fetchAssignments, fetchClaims])

  useEffect(() => {
    const availableKeys = new Set(
      missing.map((match) => getSlotKey(match.eventKey, match.matchNumber, match.position))
    )
    setSelectedKeys((prev) => prev.filter((key) => availableKeys.has(key)))
  }, [missing])

  useEffect(() => {
    if (!assignDialogOpen) {
      setSelectedAssigneeEmail("")
      setAssignmentNote("")
    }
  }, [assignDialogOpen])

  useEffect(() => {
    if (!assigneeOptions.length) {
      setPushStatuses({})
      return
    }

    let cancelled = false

    const fetchPushStatuses = async () => {
      try {
        const emails = assigneeOptions.map((option) => option.email).join(",")
        const data = await apiGet<{ statuses: Record<string, PushSubscriptionStatus> }>(
          `/push/subscriptions/status?emails=${encodeURIComponent(emails)}`
        )
        if (!cancelled) {
          setPushStatuses(data.statuses ?? {})
        }
      } catch {
        if (!cancelled) {
          setPushStatuses({})
        }
      }
    }

    void fetchPushStatuses()

    return () => {
      cancelled = true
    }
  }, [assigneeOptions])

  // Release claim on unmount (best-effort)
  useEffect(() => {
    const claimId = myClaimId
    const hb = heartbeatRef
    return () => {
      if (claimId !== null) {
        navigator.sendBeacon?.(`/api/rescout/claims/${claimId}`)
        void apiDelete(`/rescout/claims/${claimId}`).catch(() => null)
        if (hb.current) clearInterval(hb.current)
      }
    }
  }, [myClaimId])

  const handleClaim = async (match: MissingMatch) => {
    if (!user) return
    const scoutName = localStorage.getItem("scoutName") || user.email

    try {
      const data = await apiPost<{ claim: ActiveClaim }>("/rescout/claims", {
        matchNumber: match.matchNumber,
        alliance: match.alliance,
        position: match.position,
        eventKey: match.eventKey,
        scoutName,
      })

      const claimId = data.claim.id
      setMyClaimId(claimId)
      setClaims((prev) => [...prev, data.claim])

      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(async () => {
        try {
          await apiPatch(`/rescout/claims/${claimId}/heartbeat`, {})
        } catch {
          // non-critical
        }
      }, HEARTBEAT_MS)

      navigate("/game-start", {
        state: {
          inputs: {
            matchNumber: match.matchNumNormalized,
            alliance: match.alliance.toLowerCase(),
            teamPosition: match.slotIndex,
            teamNumber: match.teamNumber,
          },
          rescoutClaimId: claimId,
        },
      })
    } catch (err: unknown) {
      if (err && typeof err === "object" && "status" in err && (err as { status: number }).status === 409) {
        toast.error("This slot was just claimed by someone else")
        await fetchClaims()
      } else {
        toast.error("Failed to claim match")
      }
    }
  }

  const toggleSelected = (match: MissingMatch, checked: boolean) => {
    const key = getSlotKey(match.eventKey, match.matchNumber, match.position)
    setSelectedKeys((prev) =>
      checked ? [...new Set([...prev, key])] : prev.filter((value) => value !== key)
    )
  }

  const handleAssignSelected = async () => {
    if (!selectedMatches.length) {
      toast.error("Select at least one match first")
      return
    }
    if (!selectedAssigneeEmail) {
      toast.error("Choose a rescouter")
      return
    }

    const assignee = assigneeOptionMap.get(selectedAssigneeEmail)
    if (!assignee) {
      toast.error("Choose a valid rescouter")
      return
    }

    setAssigning(true)
    try {
      const data = await apiPost<{
        assignments: RescoutAssignment[]
        notified: boolean
        notification?: {
          success: boolean
          deliveredCount: number
          attempted: number
          reason?: string
        }
      }>("/rescout/assignments", {
        eventKey,
        assigneeEmail: assignee.email,
        assigneeName: assignee.label,
        note: assignmentNote.trim(),
        matches: selectedMatches.map((match) => ({
          matchNumber: match.matchNumber,
          alliance: match.alliance,
          position: match.position,
          originalScout: match.assignedScout,
        })),
      })

      await fetchAssignments()
      setSelectedKeys([])
      setAssignDialogOpen(false)
      if (data.notification?.success) {
        toast.success(
          `Assigned ${selectedMatches.length} match${selectedMatches.length === 1 ? "" : "es"} to ${assignee.label} and sent ${data.notification.deliveredCount} push notification${data.notification.deliveredCount === 1 ? "" : "s"}`
        )
      } else if (data.notification?.reason === "no_subscriptions") {
        toast.warning(
          `Assignments saved for ${assignee.label}, but they have not enabled push notifications on any device`
        )
      } else if (data.notified) {
        toast.success(`Assigned ${selectedMatches.length} match${selectedMatches.length === 1 ? "" : "es"} to ${assignee.label}`)
      } else {
        toast.warning(
          `Assignments saved for ${assignee.label}, but no push notification was delivered`
        )
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to assign matches"
      toast.error(message)
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassign = async (assignmentId: number) => {
    try {
      await apiDelete(`/rescout/assignments/${assignmentId}`)
      setAssignments((prev) => prev.filter((assignment) => assignment.id !== assignmentId))
      toast.success("Assignment removed")
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to remove assignment"
      toast.error(message)
    }
  }

  if (!canRescout) {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <p className="text-muted-foreground">You don&apos;t have rescouter access.</p>
      </div>
    )
  }

  return (
    <div className="container mx-auto p-4 max-w-2xl space-y-4 pb-28">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Rescout Missing Matches</h1>
          <p className="text-sm text-muted-foreground">
            {eventKey ? `Event: ${eventKey}` : "No event configured"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMissing} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && (
        <div className="py-12 text-center text-muted-foreground">Loading missing matches…</div>
      )}

      {!loading && missing.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <ClipboardCheck className="h-8 w-8" />
            <p>No missing matches found.</p>
          </CardContent>
        </Card>
      )}

      {!loading &&
        missing.map((match) => {
          const slotKey = getSlotKey(match.eventKey, match.matchNumber, match.position)
          const claimForSlot = claims.find(
            (claim) =>
              claim.matchNumber === match.matchNumber &&
              claim.alliance.toLowerCase() === match.alliance.toLowerCase() &&
              claim.position === match.position &&
              claim.eventKey === match.eventKey
          )
          const assignment = assignmentBySlot.get(slotKey)
          const claimedByMe = claimForSlot?.scoutEmail === myEmail
          const claimedByOther = Boolean(claimForSlot) && !claimedByMe
          const assignedToMe = assignment?.assigneeEmail?.trim().toLowerCase() === myEmail
          const ytKey = videoKeys[match.matchNumNormalized]

          return (
            <Card key={slotKey}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    {isUltraAdmin && (
                      <Checkbox
                        checked={selectedKeySet.has(slotKey)}
                        onCheckedChange={(checked) => toggleSelected(match, checked === true)}
                        aria-label={`Select match ${match.matchNumNormalized} ${match.position}`}
                        className="mt-1"
                      />
                    )}
                    <div>
                      <CardTitle className="text-base">
                        Match {match.matchNumNormalized} - {match.position.toUpperCase()}
                      </CardTitle>
                      <div className="mt-1 text-sm text-muted-foreground">
                        Team <span className="font-medium text-foreground">{match.teamNumber}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {ytKey && (
                      <a
                        href={`https://www.youtube.com/watch?v=${ytKey}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground transition-colors hover:text-red-500"
                        title="Watch on YouTube"
                      >
                        <Youtube className="h-4 w-4" />
                      </a>
                    )}
                    {isUltraAdmin && assignment && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => void handleUnassign(assignment.id)}
                        title="Remove rescout assignment"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                    <Badge
                      className={
                        match.alliance === "Red"
                          ? "border-red-500/30 bg-red-500/15 text-red-600"
                          : "border-blue-500/30 bg-blue-500/15 text-blue-600"
                      }
                      variant="outline"
                    >
                      {match.alliance}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground">
                  Rescout:{" "}
                  <span className="font-medium text-foreground">
                    {assignment?.assigneeName || "Unassigned"}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Originally assigned:{" "}
                  <span className="font-medium text-foreground">{match.assignedScout}</span>
                </div>
                {assignment?.note && (
                  <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                    {assignment.note}
                  </div>
                )}
                {assignment && (
                  <Badge variant={assignedToMe ? "default" : "secondary"}>
                    {assignedToMe ? "Assigned to you" : `Assigned to ${assignment.assigneeName}`}
                  </Badge>
                )}
                {claimedByMe && <Badge variant="secondary">Being worked on by you</Badge>}
                {claimedByOther && (
                  <Badge variant="outline" className="text-muted-foreground">
                    Being worked on by {claimForSlot?.scoutName}
                  </Badge>
                )}
                {!claimForSlot && (
                  <Button size="sm" onClick={() => void handleClaim(match)}>
                    Scout this
                  </Button>
                )}
              </CardContent>
            </Card>
          )
        })}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Assign rescout matches</DialogTitle>
            <DialogDescription>
              Assign {selectedMatches.length} selected match{selectedMatches.length === 1 ? "" : "es"} to a rescouter.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="rescout-assignee">Rescouter</Label>
              <Select value={selectedAssigneeEmail} onValueChange={setSelectedAssigneeEmail}>
                <SelectTrigger id="rescout-assignee">
                  <SelectValue placeholder="Select a rescouter" />
                </SelectTrigger>
                <SelectContent>
                  {assigneeOptions.map((option) => (
                    <SelectItem key={option.email} value={option.email}>
                      {option.label}
                      {pushStatuses[option.email]?.hasSubscription === false ? " (no push enabled)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedAssigneeEmail && selectedAssigneePushStatus?.hasSubscription === false && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
                This rescouter does not currently have push enabled on any device. The assignment will still save, but they will not get an alert until they enable notifications in the app.
              </div>
            )}

            {selectedAssigneeEmail && selectedAssigneePushStatus?.hasSubscription === true && (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-700 dark:text-emerald-300">
                Push is enabled on {selectedAssigneePushStatus.subscriptionCount} device{selectedAssigneePushStatus.subscriptionCount === 1 ? "" : "s"} for this rescouter.
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="rescout-note">Note (optional)</Label>
              <Textarea
                id="rescout-note"
                placeholder="Anything the rescouter should know"
                maxLength={500}
                value={assignmentNote}
                onChange={(event) => setAssignmentNote(event.target.value)}
              />
            </div>

            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
              {selectedMatches
                .map((match) => `${match.matchNumNormalized} ${match.position.toUpperCase()}`)
                .join(", ")}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAssignDialogOpen(false)} disabled={assigning}>
                Cancel
              </Button>
              <Button onClick={() => void handleAssignSelected()} disabled={assigning || assigneeOptions.length === 0}>
                {assigning ? "Assigning..." : "Confirm assignment"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {isUltraAdmin && selectedMatches.length > 0 && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex w-full max-w-2xl items-center justify-between gap-3 rounded-xl border bg-background/95 px-4 py-3 shadow-lg backdrop-blur">
            <div className="text-sm text-muted-foreground">
              {selectedMatches.length} selected
            </div>
            <Button onClick={() => setAssignDialogOpen(true)} disabled={assigneeOptions.length === 0}>
              <UserPlus className="mr-2 h-4 w-4" />
              Assign selected
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

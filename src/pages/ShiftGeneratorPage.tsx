import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { AlertTriangle, CalendarDays, Download, Eye, Radio, RefreshCw, Send } from "lucide-react"
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient"
import {
  EVENT_UPDATED_EVENT,
  STORAGE_EVENT_NAME_KEY,
  getEventDisplayName,
  syncEventSettings,
} from "@/lib/eventSettingsClient"
import {
  applyScheduleCoverageOverride,
  clearScheduleCoverageOverride,
  fetchRemoteSchedule,
  syncScheduleAssignments,
  type RemoteScheduleState,
} from "@/lib/scheduleApi"
import {
  deriveCoverageBlocks,
  formatShiftRange,
  groupShiftBlocksByDay,
} from "@/lib/scoutShiftSchedule"
import { getQualificationMatches, resolveTbaApiKey } from "@/lib/tbaUtils"
import {
  POSITION_LABELS,
  POSITIONS,
  buildGeneratedSchedule,
  deriveShiftAssignmentsFromSchedule,
  generateShiftSchedule,
  type GeneratedSchedule,
  type Position,
  type ScoutInput,
  type ShiftAssignment,
} from "@/lib/shiftGenerator"
import type { ParsedMatch, StoredScheduleState } from "@/types/schedule"
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

const STORAGE_KEY = "shift_generator_state"
const SCHEDULE_KEY = "schedule_automation_state"

type LoadPref = 1 | 2 | 3
const LOAD_LABELS: Record<LoadPref, string> = { 1: "Light (1 shift)", 2: "Normal (2 shifts)", 3: "Heavy (3 shifts)" }

interface AttendeeEntry {
  email: string
  displayName: string
  present: boolean
  load: LoadPref
}

interface WatchStatus {
  watching: boolean
  released: boolean
  eventKey: string | null
  matchCount: number | null
}

interface PersistedState {
  eventKey: string
  shiftSize: number
  overlapEnabled: boolean
  attendees: AttendeeEntry[]
  generated: GeneratedSchedule | null
}

type PendingCoverageAction =
  | {
      type: "apply"
      blockKey: string
      replacementEmail: string
      reason: string
    }
  | {
      type: "clear"
      blockKey: string
    }

const NO_REPLACEMENT_VALUE = "__none__"
const statusBadgeClassName = {
  current: "border-red-500/30 bg-red-500 text-white",
  completed: "border-red-500/15 bg-red-500/10 text-red-600 dark:text-red-300",
  upcoming: "border-border bg-muted text-foreground/80",
}
const positionBadgeClassName = {
  red: "border-red-500/20 bg-red-500/12 text-red-600 dark:text-red-300",
  blue: "border-blue-500/20 bg-blue-500/12 text-blue-600 dark:text-blue-300",
}

const normalizeEmail = (value: string) => value.trim().toLowerCase()

const ensureGeneratedScheduleShape = (
  schedule: GeneratedSchedule,
  scouts: Pick<ScoutInput, "email" | "displayName">[],
  fallbackOverlapEnabled: boolean,
): GeneratedSchedule => {
  const shiftAssignments = Array.isArray(schedule.shiftAssignments) && schedule.shiftAssignments.length === schedule.shiftRanges.length
    ? schedule.shiftAssignments
    : deriveShiftAssignmentsFromSchedule(schedule)

  return buildGeneratedSchedule({
    overlapEnabled: typeof schedule.overlapEnabled === "boolean" ? schedule.overlapEnabled : fallbackOverlapEnabled,
    scouts,
    shiftAssignments,
    shiftRanges: schedule.shiftRanges,
    warnings: schedule.warnings ?? [],
  })
}

const buildCoverageBlockKey = (block: {
  position: string
  startMatchNumber: string
  endMatchNumber: string
  effectiveScoutEmail: string
  originalScoutEmail: string | null
}) =>
  [
    block.position,
    block.startMatchNumber,
    block.endMatchNumber,
    block.effectiveScoutEmail,
    block.originalScoutEmail || "",
  ].join("::")

const downloadFile = (content: string, filename: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

const toPublishedMatches = async (eventKey: string): Promise<ParsedMatch[]> => {
  const apiKey = resolveTbaApiKey()
  if (!apiKey) return []

  try {
    const matches = await getQualificationMatches(eventKey, apiKey)
    return matches.map((match) => {
      const startSeconds = match.actual_time || match.predicted_time || match.time || 0
      return {
        matchNumber: `qm${match.match_number}`,
        startTime: startSeconds > 0 ? new Date(startSeconds * 1000).toISOString() : undefined,
        red: match.alliances.red.team_keys.map((team) => team.replace(/^frc/i, "")),
        blue: match.alliances.blue.team_keys.map((team) => team.replace(/^frc/i, "")),
      }
    })
  } catch (error) {
    console.warn("Failed to load qualification matches for published schedule", error)
    return []
  }
}

const ShiftGeneratorPage = () => {
  const { isLead, roleAssignments, recentUsers } = useAuth()

  // ─── Persisted state ────────────────────────────────────────────────────
  const [eventKey, setEventKey] = useState("")
  const [shiftSize, setShiftSize] = useState(7)
  const [overlapEnabled, setOverlapEnabled] = useState(false)
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([])
  const [savedEventKey, setSavedEventKey] = useState("")
  const [hasHydrated, setHasHydrated] = useState(false)

  // ─── TBA watch ──────────────────────────────────────────────────────────
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({
    watching: false, released: false, eventKey: null, matchCount: null,
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Generated schedule ──────────────────────────────────────────────────
  const [generated, setGenerated] = useState<GeneratedSchedule | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false)
  const [remoteSchedule, setRemoteSchedule] = useState<RemoteScheduleState | null>(null)
  const [loadingCoverage, setLoadingCoverage] = useState(false)
  const [replacementSelections, setReplacementSelections] = useState<Record<string, string>>({})
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({})
  const [coverageActionLoadingKey, setCoverageActionLoadingKey] = useState<string | null>(null)
  const [pendingCoverageAction, setPendingCoverageAction] = useState<PendingCoverageAction | null>(null)

  // ─── Build attendee list from registered scouts ───────────────────────────
  const registeredScouts = useMemo(() => {
    const emails = Object.entries(roleAssignments)
      .filter(([, role]) => role !== "pending")
      .map(([email]) => email)

    return emails.map((email) => {
      const ru = recentUsers.find((u) => u.email === email)
      return {
        email,
        displayName: ru?.displayName || email,
      }
    }).sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [roleAssignments, recentUsers])

  // ─── Load persisted state ─────────────────────────────────────────────────
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const stored = JSON.parse(raw) as PersistedState
        if (stored.shiftSize) setShiftSize(stored.shiftSize)
        if (typeof stored.overlapEnabled === 'boolean') setOverlapEnabled(stored.overlapEnabled)
        if (Array.isArray(stored.attendees)) setAttendees(stored.attendees)
        if (stored.eventKey) setSavedEventKey(stored.eventKey)
        if (stored.generated) {
          setGenerated(
            ensureGeneratedScheduleShape(
              stored.generated,
              Array.isArray(stored.attendees)
                ? stored.attendees.map(({ email, displayName }) => ({ email, displayName }))
                : [],
              typeof stored.overlapEnabled === "boolean" ? stored.overlapEnabled : false,
            ),
          )
        }
      }
    } catch {
      // ignore
    } finally {
      setHasHydrated(true)
    }
  }, [])

  useEffect(() => {
    const applyStoredEventKey = () => {
      try {
        const storedEvent = localStorage.getItem(STORAGE_EVENT_NAME_KEY)?.trim() ?? ""
        if (storedEvent) {
          setEventKey(storedEvent)
        }
      } catch {
        // ignore
      }
    }

    const refreshEventKey = async () => {
      applyStoredEventKey()
      try {
        const settings = await syncEventSettings()
        setEventKey(settings.currentEvent?.trim() ?? "")
      } catch {
        applyStoredEventKey()
      }
    }

    void refreshEventKey()

    const handleEventUpdate = () => {
      applyStoredEventKey()
    }

    const handleFocus = () => {
      void refreshEventKey()
    }

    window.addEventListener(EVENT_UPDATED_EVENT, handleEventUpdate)
    window.addEventListener("focus", handleFocus)

    return () => {
      window.removeEventListener(EVENT_UPDATED_EVENT, handleEventUpdate)
      window.removeEventListener("focus", handleFocus)
    }
  }, [])

  // ─── Sync attendee list when registered scouts change ────────────────────
  useEffect(() => {
    if (!hasHydrated) {
      return
    }
    setAttendees((prev) => {
      if (registeredScouts.length === 0) {
        return prev
      }
      const existingByEmail = new Map(prev.map((a) => [a.email, a]))
      return registeredScouts.map((scout) => {
        const existing = existingByEmail.get(scout.email)
        if (existing) return { ...existing, displayName: scout.displayName }
        const role = roleAssignments[scout.email]
        const defaultLoad: LoadPref =
          role === 'scout_plus' ? 3 :
          role === 'scout_minus' ? 1 :
          2
        return { email: scout.email, displayName: scout.displayName, present: false, load: defaultLoad }
      })
    })
  }, [hasHydrated, registeredScouts, roleAssignments])

  // ─── Persist state ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!hasHydrated) {
      return
    }
    const state: PersistedState = { eventKey: savedEventKey || eventKey, shiftSize, overlapEnabled, attendees, generated }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [attendees, eventKey, generated, hasHydrated, overlapEnabled, savedEventKey, shiftSize])

  useEffect(() => {
    if (!eventKey || !savedEventKey || eventKey === savedEventKey) {
      return
    }
    setGenerated(null)
    setSavedEventKey(eventKey)
  }, [eventKey, savedEventKey])

  // ─── Fetch TBA watch status on mount ─────────────────────────────────────
  useEffect(() => {
    apiGet<WatchStatus>("/schedule/watch-status")
      .then((status) => setWatchStatus(status))
      .catch(() => {})
  }, [])

  const refreshCoverageSchedule = useCallback(async (nextEventKey = eventKey) => {
    if (!isLead || !nextEventKey.trim()) {
      setRemoteSchedule(null)
      return
    }

    setLoadingCoverage(true)
    try {
      const remote = await fetchRemoteSchedule(nextEventKey.trim())
      setRemoteSchedule(remote)
    } catch (error) {
      console.warn("Failed to load coverage schedule", error)
      setRemoteSchedule(null)
    } finally {
      setLoadingCoverage(false)
    }
  }, [eventKey, isLead])

  useEffect(() => {
    void refreshCoverageSchedule()
  }, [refreshCoverageSchedule])

  // ─── Attendee helpers ─────────────────────────────────────────────────────
  const setPresent = (email: string, present: boolean) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, present } : a))

  const setLoad = (email: string, load: LoadPref) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, load } : a))

  const presentAttendees = attendees.filter((a) => a.present)
  const totalSlots = presentAttendees.reduce((sum, a) => sum + a.load, 0)
  const estimatedShifts = shiftSize > 0 ? Math.ceil((watchStatus.matchCount ?? 72) / shiftSize) : 0
  const checkedInScoutOptions = useMemo(
    () =>
      presentAttendees
        .map((attendee) => ({
          email: attendee.email,
          label: attendee.displayName,
        }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [presentAttendees]
  )

  const displayNameByEmail = useMemo(() => {
    const map = new Map<string, string>()
    recentUsers.forEach((record) => {
      const email = normalizeEmail(record.email || "")
      if (!email) return
      map.set(email, record.displayName?.trim() || record.email)
    })
    Object.keys(roleAssignments).forEach((email) => {
      const normalized = normalizeEmail(email)
      if (!map.has(normalized)) {
        map.set(normalized, email)
      }
    })
    return map
  }, [recentUsers, roleAssignments])

  const coverageBlocks = useMemo(
    () =>
      deriveCoverageBlocks({
        assignments: remoteSchedule?.assignments ?? [],
        matches: remoteSchedule?.matches ?? [],
        overrides: remoteSchedule?.overrides ?? [],
        lastCompletedMatch: remoteSchedule?.lastCompletedMatch ?? null,
        includeCompleted: false,
      }),
    [remoteSchedule?.assignments, remoteSchedule?.lastCompletedMatch, remoteSchedule?.matches, remoteSchedule?.overrides]
  )

  const groupedCoverageBlocks = useMemo(() => groupShiftBlocksByDay(coverageBlocks), [coverageBlocks])

  useEffect(() => {
    setReplacementSelections((prev) => {
      const next = { ...prev }
      coverageBlocks.forEach((block) => {
        const key = buildCoverageBlockKey(block)
        if (!(key in next)) {
          next[key] = block.overrideScoutEmail || ""
        }
      })
      return next
    })
  }, [coverageBlocks])

  const getDisplayName = useCallback((email?: string | null) => {
    if (!email) return "Unassigned"
    return displayNameByEmail.get(normalizeEmail(email)) || email
  }, [displayNameByEmail])

  const replacementOptionsByBlock = useMemo(() => {
    const scheduledScoutEmails = new Set<string>()
    const assignedByMatch = new Map<string, Set<string>>()

    const addScheduledScout = (rawEmail?: string | null) => {
      const normalized = normalizeEmail(rawEmail || "")
      if (!normalized || normalized === "unassigned") {
        return ""
      }
      scheduledScoutEmails.add(normalized)
      return normalized
    }

    for (const assignment of remoteSchedule?.assignments ?? []) {
      const positions = assignment.positions as Record<string, string>
      for (const rawEmail of Object.values(positions)) {
        const normalized = addScheduledScout(rawEmail)
        if (!normalized) {
          continue
        }
        const assigned = assignedByMatch.get(assignment.matchNumber) ?? new Set<string>()
        assigned.add(normalized)
        assignedByMatch.set(assignment.matchNumber, assigned)
      }
    }

    for (const override of remoteSchedule?.overrides ?? []) {
      addScheduledScout(override.originalScoutEmail)
      addScheduledScout(override.overrideScoutEmail)
    }

    const sortedScheduledScouts = Array.from(scheduledScoutEmails).sort((a, b) =>
      getDisplayName(a).localeCompare(getDisplayName(b))
    )

    return coverageBlocks.reduce<Record<string, Array<{ email: string; label: string }>>>((acc, block) => {
      const blockKey = buildCoverageBlockKey(block)
      const blockedEmails = new Set<string>()
      block.matches.forEach((match) => {
        assignedByMatch.get(match.matchNumber)?.forEach((email) => {
          blockedEmails.add(email)
        })
      })

      const options = sortedScheduledScouts
        .filter((email) => !blockedEmails.has(email))
        .map((email) => ({
          email,
          label: getDisplayName(email),
        }))

      const selectedEmail = replacementSelections[blockKey] || block.overrideScoutEmail || ""
      if (selectedEmail && !options.some((option) => option.email === selectedEmail)) {
        options.unshift({
          email: selectedEmail,
          label: getDisplayName(selectedEmail),
        })
      }

      acc[blockKey] = options
      return acc
    }, {})
  }, [coverageBlocks, getDisplayName, remoteSchedule?.assignments, remoteSchedule?.overrides, replacementSelections])

  const getShiftOptions = useCallback((shiftAssignment: ShiftAssignment, position: Position) => {
    const assignedElsewhere = new Set(
      POSITIONS
        .filter((slot) => slot !== position)
        .map((slot) => shiftAssignment[slot])
        .filter((email) => email && email !== "Unassigned")
    )

    const options = checkedInScoutOptions.filter(
      (option) => option.email === shiftAssignment[position] || !assignedElsewhere.has(option.email)
    )

    if (shiftAssignment[position] === "Unassigned") {
      return [{ email: "Unassigned", label: "Unassigned" }, ...options]
    }

    if (shiftAssignment[position] && !options.some((option) => option.email === shiftAssignment[position])) {
      return [
        {
          email: shiftAssignment[position],
          label: getDisplayName(shiftAssignment[position]),
        },
        ...options,
      ]
    }

    return options
  }, [checkedInScoutOptions, getDisplayName])

  const updateShiftAssignment = useCallback((shiftIndex: number, position: Position, nextEmail: string) => {
    setGenerated((prev) => {
      if (!prev) {
        return prev
      }

      const nextShiftAssignments = prev.shiftAssignments.map((assignment, index) => (
        index === shiftIndex ? { ...assignment, [position]: nextEmail } : assignment
      ))

      return buildGeneratedSchedule({
        overlapEnabled: prev.overlapEnabled,
        scouts: presentAttendees,
        shiftAssignments: nextShiftAssignments,
        shiftRanges: prev.shiftRanges,
        warnings: prev.warnings,
      })
    })
  }, [presentAttendees])

  // ─── TBA Watch ────────────────────────────────────────────────────────────
  const startWatch = useCallback(async () => {
    const key = eventKey.trim()
    if (!key) { toast.error("Set the current event in Event Settings first"); return }
    const tbaApiKey = resolveTbaApiKey()
    if (!tbaApiKey) { toast.error("No TBA API key configured"); return }

    try {
      const status = await apiPost<WatchStatus>("/schedule/watch", { eventKey: key, tbaApiKey })
      setWatchStatus(status)
      if (status.released) {
        toast.success(`Schedule already released — ${status.matchCount} qual matches`)
      } else {
        toast.success("Watching TBA for schedule release…")
      }
    } catch {
      toast.error("Failed to start TBA watch")
    }
  }, [eventKey])

  const stopWatch = useCallback(async (options?: { silent?: boolean }) => {
    try {
      await apiDelete("/schedule/watch")
      setWatchStatus({ watching: false, released: false, eventKey: null, matchCount: null })
      if (!options?.silent) {
        toast.info("Watch stopped")
      }
      return true
    } catch {
      if (!options?.silent) {
        toast.error("Failed to stop watch")
      }
      return false
    }
  }, [])

  // Poll watch-status every 15s when watching
  useEffect(() => {
    if (!watchStatus.watching) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
      return
    }
    pollRef.current = setInterval(async () => {
      try {
        const status = await apiGet<WatchStatus>("/schedule/watch-status")
        setWatchStatus(status)
        if (status.released) {
          toast.success(`Schedule released — ${status.matchCount} qual matches!`)
        }
      } catch {
        // ignore
      }
    }, 15_000)
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null } }
  }, [watchStatus.watching])

  // ─── Generate ─────────────────────────────────────────────────────────────
  const generate = async () => {
    const scouts: ScoutInput[] = presentAttendees.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      targetShifts: a.load,
    }))
    if (scouts.length === 0) { toast.error("Check in at least one scout first"); return }
    if (!eventKey.trim()) { toast.error("Set the current event in Event Settings first"); return }

    const totalMatches = watchStatus.matchCount ?? 72
    const result = generateShiftSchedule({ scouts, totalMatches, shiftSize, overlapEnabled })
    setGenerated(result)
    setSavedEventKey(eventKey.trim())
    let stoppedWatch = false
    if (watchStatus.watching && watchStatus.eventKey === eventKey.trim()) {
      stoppedWatch = await stopWatch({ silent: true })
    }
    if (result.warnings.length > 0) {
      toast.warning(
        stoppedWatch
          ? "Schedule generated with staffing warnings. TBA watch stopped."
          : "Schedule generated with staffing warnings."
      )
    } else {
      toast.success(
        stoppedWatch
          ? "Schedule generated. TBA watch stopped."
          : "Schedule generated."
      )
    }
  }

  // ─── Publish ──────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!generated) return
    if (!eventKey.trim()) { toast.error("Set the current event in Event Settings before publishing"); return }
    setPublishing(true)
    try {
      const publishedMatches = await toPublishedMatches(eventKey.trim())
      const state: StoredScheduleState = {
        eventKey: eventKey.trim(),
        matches: publishedMatches,
        assignments: generated.assignments,
        aliases: {},
        mode: "manual",
      }
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(state))
      window.dispatchEvent(new Event("scheduleAutomationUpdated"))

      await syncScheduleAssignments({
        eventKey: eventKey.trim(),
        matches: publishedMatches,
        assignments: generated.assignments,
        notify: true,
      })
      await refreshCoverageSchedule(eventKey.trim())
      toast.success("Schedule published to all scouts")
    } catch {
      toast.error("Failed to publish — saved locally only")
    } finally {
      setPublishing(false)
    }
  }

  // ─── CSV download ─────────────────────────────────────────────────────────
  const downloadCsv = () => {
    if (!generated) return
    const filename = `${eventKey || "schedule"}_shifts.csv`
    downloadFile(generated.csv, filename, "text/csv;charset=utf-8")
    toast.success("CSV downloaded")
  }

  // ─── Render ───────────────────────────────────────────────────────────────
  const displayEventName = eventKey ? getEventDisplayName(eventKey) : ""
  const visibleWarnings = generated?.warnings.slice(0, 6) ?? []
  const isWatchingCurrentEvent = watchStatus.watching && watchStatus.eventKey === eventKey
  const isReleasedForCurrentEvent = watchStatus.released && watchStatus.eventKey === eventKey

  const openApplyCoverageConfirmation = (blockKey: string, replacementEmail: string, reason: string) => {
    setPendingCoverageAction({
      type: "apply",
      blockKey,
      replacementEmail,
      reason,
    })
  }

  const openClearCoverageConfirmation = (blockKey: string) => {
    setPendingCoverageAction({
      type: "clear",
      blockKey,
    })
  }

  const handleConfirmCoverageAction = async () => {
    if (!pendingCoverageAction || !remoteSchedule?.eventKey) {
      setPendingCoverageAction(null)
      return
    }

    const block = coverageBlocks.find((entry) => buildCoverageBlockKey(entry) === pendingCoverageAction.blockKey)
    if (!block) {
      setPendingCoverageAction(null)
      return
    }

    const matchNumbers = block.matches.map((match) => match.matchNumber)
    setCoverageActionLoadingKey(pendingCoverageAction.blockKey)

    try {
      if (pendingCoverageAction.type === "apply") {
        await applyScheduleCoverageOverride({
          eventKey: remoteSchedule.eventKey,
          matchNumbers,
          position: block.position,
          overrideScoutEmail: pendingCoverageAction.replacementEmail,
          reason: pendingCoverageAction.reason.trim(),
        })
        toast.success(`${getDisplayName(pendingCoverageAction.replacementEmail)} tagged in for ${block.positionLabel}.`)
      } else {
        await clearScheduleCoverageOverride({
          eventKey: remoteSchedule.eventKey,
          matchNumbers,
          position: block.position,
        })
        toast.success(`Coverage override cleared for ${block.positionLabel}.`)
      }

      await refreshCoverageSchedule(remoteSchedule.eventKey)
    } catch (error) {
      console.error("Failed to update coverage override", error)
      toast.error(error instanceof Error && error.message ? error.message : "Failed to update coverage.")
    } finally {
      setCoverageActionLoadingKey(null)
      setPendingCoverageAction(null)
    }
  }

  return (
    <div className="p-4 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Shift Generator</h1>
        <p className="text-muted-foreground text-sm">Build the scouting rotation for your competition.</p>
      </div>

      {/* ── Panel 1: Event + TBA Watch ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Radio className="h-4 w-4" />
            Event + TBA Watch
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-md border bg-muted/30 px-3 py-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              Current event
              {eventKey && <Badge variant="secondary">{displayEventName}</Badge>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {eventKey
                ? `Using ${eventKey} from Event Settings for watch and publish actions.`
                : "No current event is set yet. Set it in Event Settings first."}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {isWatchingCurrentEvent ? (
              <Button variant="outline" size="sm" onClick={() => void stopWatch()}>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Stop Watching
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startWatch} disabled={isReleasedForCurrentEvent || !eventKey.trim()}>
                <Radio className="h-4 w-4 mr-2" />
                Watch for Schedule Release
              </Button>
            )}

            {isReleasedForCurrentEvent && (
              <Badge variant="default" className="bg-green-600">
                Schedule released — {watchStatus.matchCount} qual matches
              </Badge>
            )}
            {isWatchingCurrentEvent && !isReleasedForCurrentEvent && (
              <span className="text-sm text-muted-foreground">Polling TBA every 15s…</span>
            )}
          </div>

          {watchStatus.matchCount && (
            <p className="text-sm text-muted-foreground">
              Using <strong>{watchStatus.matchCount}</strong> matches for shift calculations.
              Shift size <strong>{shiftSize}</strong> → <strong>{Math.ceil(watchStatus.matchCount / shiftSize)}</strong> shifts.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Panel 2: Attendance + Load ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Attendance
            {presentAttendees.length > 0 && (
              <span className="ml-2 font-normal text-muted-foreground text-sm">
                {presentAttendees.length} checked in · {totalSlots} shift-slots · ~{estimatedShifts} shifts of {shiftSize} matches
              </span>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2 mb-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttendees((prev) => prev.map((a) => ({ ...a, present: true })))}
            >
              Select All
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAttendees((prev) => prev.map((a) => ({ ...a, present: false })))}
            >
              Deselect All
            </Button>
          </div>

          {attendees.length === 0 && (
            <p className="text-sm text-muted-foreground">No registered scouts found. Scouts must log in and be approved first.</p>
          )}

          <div className="space-y-1">
            {attendees.map((attendee) => (
              <div
                key={attendee.email}
                className={`flex items-center gap-3 rounded-md px-3 py-2 transition-colors ${attendee.present ? "bg-muted" : ""}`}
              >
                <Checkbox
                  id={`attend-${attendee.email}`}
                  checked={attendee.present}
                  onCheckedChange={(checked) => setPresent(attendee.email, Boolean(checked))}
                />
                <label
                  htmlFor={`attend-${attendee.email}`}
                  className="flex-1 text-sm cursor-pointer select-none"
                >
                  <span className="font-medium">{attendee.displayName}</span>
                  <span className="text-muted-foreground ml-2 text-xs">{attendee.email}</span>
                </label>
                {attendee.present && (
                  <Select
                    value={String(attendee.load)}
                    onValueChange={(v) => setLoad(attendee.email, Number(v) as LoadPref)}
                  >
                    <SelectTrigger className="w-40 h-7 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {([1, 2, 3] as LoadPref[]).map((v) => (
                        <SelectItem key={v} value={String(v)} className="text-xs">
                          {LOAD_LABELS[v]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── Panel 3: Generate + Preview ── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Eye className="h-4 w-4" />
            Generate &amp; Preview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <Label htmlFor="shift-size">Matches per shift</Label>
              <Input
                id="shift-size"
                type="number"
                min={1}
                max={watchStatus.matchCount ?? 200}
                value={shiftSize}
                onChange={(e) => setShiftSize(Math.max(1, parseInt(e.target.value) || 7))}
                className="w-28"
              />
            </div>
            <div className="flex flex-col gap-1 pb-0.5">
              <Label className="text-sm">Shift Overlap</Label>
              <div
                className="flex items-center gap-2 cursor-pointer"
                onClick={() => setOverlapEnabled((v) => !v)}
              >
                <Checkbox
                  id="overlap-toggle"
                  checked={overlapEnabled}
                  onCheckedChange={(checked) => setOverlapEnabled(Boolean(checked))}
                />
                <label htmlFor="overlap-toggle" className="text-sm cursor-pointer select-none">
                  Overlap boundary match
                </label>
              </div>
              {overlapEnabled && (
                <p className="text-xs text-muted-foreground">
                  All 12 scouts cover the handoff match (e.g. 1-7 &amp; 7-13).
                </p>
              )}
            </div>
            <Button onClick={generate} disabled={presentAttendees.length === 0}>
              Generate Schedule
            </Button>
          </div>

          {generated && (
            <>
              {generated.warnings.length > 0 && (
                <div className="rounded-md border border-yellow-300 bg-yellow-50 dark:bg-yellow-950 p-3 space-y-1">
                  <div className="flex items-center gap-2 text-yellow-700 dark:text-yellow-300 font-medium text-sm">
                    <AlertTriangle className="h-4 w-4" />
                    Staffing notes
                  </div>
                  {visibleWarnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300 ml-6">{w}</p>
                  ))}
                  {generated.warnings.length > visibleWarnings.length && (
                    <p className="text-xs text-yellow-700 dark:text-yellow-300 ml-6">
                      {generated.warnings.length - visibleWarnings.length} more note{generated.warnings.length - visibleWarnings.length === 1 ? "" : "s"} hidden.
                    </p>
                  )}
                </div>
              )}

              {/* Transposed preview table */}
              <div className="overflow-x-auto rounded-md border">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="px-3 py-2 text-left font-medium">Position</th>
                      {generated.shiftRanges.map((r) => (
                        <th key={r.label} className="px-3 py-2 text-left font-medium whitespace-nowrap">
                          {r.label}
                          {r.overlapAtStart && (
                            <span className="ml-1 text-[10px] text-muted-foreground font-normal">↔</span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {POSITIONS.map((pos, idx) => {
                      const label = POSITION_LABELS[pos]
                      const isRed = pos.startsWith("red")
                      return (
                        <tr key={pos} className={`border-b last:border-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                          <td className={`px-3 py-2 font-medium ${isRed ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                            {label}
                          </td>
                          {generated.shiftRanges.map((range, shiftIndex) => {
                            const shiftAssignment = generated.shiftAssignments[shiftIndex]
                            const email = shiftAssignment?.[pos] ?? "Unassigned"
                            const options = shiftAssignment
                              ? getShiftOptions(shiftAssignment, pos)
                              : [{ email: "Unassigned", label: "Unassigned" }]
                            return (
                              <td key={range.label} className="px-3 py-2 whitespace-nowrap">
                                <Select
                                  value={email}
                                  onValueChange={(value) => updateShiftAssignment(shiftIndex, pos, value)}
                                >
                                  <SelectTrigger className="h-8 min-w-[10rem] border-0 bg-transparent px-0 text-xs shadow-none focus:ring-0">
                                    <SelectValue placeholder="Select scout" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {options.map((option) => (
                                      <SelectItem key={`${range.label}-${pos}-${option.email}`} value={option.email}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-2 pt-1">
                <Button onClick={() => setPublishConfirmOpen(true)} disabled={publishing || !eventKey.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  {publishing ? "Publishing…" : "Publish to Scouts"}
                </Button>
                <Button variant="outline" onClick={downloadCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Preview changes stay local on this device until you confirm publish.
              </p>
              {!eventKey.trim() && (
                <p className="text-xs text-muted-foreground">Set an event key above to enable publishing.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {isLead && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Shift Coverage</CardTitle>
            <CardDescription>
              Admin-only temporary tag-ins for bathroom breaks, absences, or quick swaps.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {!eventKey.trim() ? (
              <p className="text-sm text-muted-foreground">Set the current event in Event Settings first.</p>
            ) : loadingCoverage ? (
              <p className="text-sm text-muted-foreground">Loading published schedule...</p>
            ) : groupedCoverageBlocks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No published current or upcoming shift blocks are available yet.</p>
            ) : (
              groupedCoverageBlocks.map((group) => (
                <section key={`coverage-${group.dayKey}`} className="space-y-3">
                  <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    <CalendarDays className="h-4 w-4" />
                    <span>{group.dayLabel}</span>
                  </div>
                  <div className="grid gap-3">
                    {group.blocks.map((block) => {
                      const blockKey = buildCoverageBlockKey(block)
                      const replacementEmail = replacementSelections[blockKey] || ""
                      const replacementOptions = replacementOptionsByBlock[blockKey] ?? []
                      const currentReason = overrideReasons[blockKey] || block.overrideReason || ""
                      const canApply = Boolean(replacementEmail) && replacementEmail !== block.effectiveScoutEmail
                      const isBusy = coverageActionLoadingKey === blockKey

                      return (
                        <Card key={blockKey} className="rounded-2xl border">
                          <CardHeader className="space-y-2 px-4 pb-3 pt-4">
                            <div className="flex flex-wrap items-center gap-2">
                              <CardTitle className="text-lg font-semibold text-red-600 dark:text-red-300">
                                {formatShiftRange(block)}
                              </CardTitle>
                              <Badge className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${positionBadgeClassName[block.alliance]}`}>
                                {block.positionLabel}
                              </Badge>
                              <Badge className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusBadgeClassName[block.status]}`}>
                                {block.status === "current" ? "Current" : "Upcoming"}
                              </Badge>
                            </div>
                            <CardDescription className="text-sm">
                              {block.matchCount} {block.matchCount === 1 ? "match" : "matches"} • Assigned to{" "}
                              <span className="font-medium text-foreground">{getDisplayName(block.effectiveScoutEmail)}</span>
                              {block.overrideScoutEmail && block.originalScoutEmail && (
                                <>
                                  {" "}covering for <span className="font-medium text-foreground">{getDisplayName(block.originalScoutEmail)}</span>
                                </>
                              )}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3 px-4 pb-4 pt-0">
                            <Select
                              value={replacementEmail || NO_REPLACEMENT_VALUE}
                              onValueChange={(value) => {
                                setReplacementSelections((prev) => ({
                                  ...prev,
                                  [blockKey]: value === NO_REPLACEMENT_VALUE ? "" : value,
                                }))
                              }}
                            >
                              <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select replacement scout" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NO_REPLACEMENT_VALUE}>Select replacement scout</SelectItem>
                                {replacementOptions.map((option) => (
                                  <SelectItem key={`${blockKey}-${option.email}`} value={option.email}>
                                    {option.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>

                            <Input
                              value={currentReason}
                              onChange={(event) =>
                                setOverrideReasons((prev) => ({
                                  ...prev,
                                  [blockKey]: event.target.value,
                                }))
                              }
                              placeholder="Optional note, like bathroom break or missing scout"
                            />

                            <div className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                disabled={!canApply || isBusy}
                                onClick={() => openApplyCoverageConfirmation(blockKey, replacementEmail, currentReason)}
                              >
                                Tag In
                              </Button>
                              {block.overrideScoutEmail && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  disabled={isBusy}
                                  onClick={() => openClearCoverageConfirmation(blockKey)}
                                >
                                  Clear Override
                                </Button>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      )
                    })}
                  </div>
                </section>
              ))
            )}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={publishConfirmOpen} onOpenChange={setPublishConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this schedule to scouts?</AlertDialogTitle>
            <AlertDialogDescription>
              This will replace the current published scouting schedule for the active event and notify scouts. Preview edits are not live until you confirm here.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={publishing}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                void publish().then(() => setPublishConfirmOpen(false))
              }}
            >
              {publishing ? "Publishing…" : "Publish Schedule"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={pendingCoverageAction !== null} onOpenChange={(open) => !open && setPendingCoverageAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingCoverageAction?.type === "apply" ? "Tag this scout into the shift?" : "Clear this coverage override?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingCoverageAction?.type === "apply"
                ? "This will update the live published schedule and send the tagged-in scout a notification."
                : "This will restore the original scout for the selected shift block."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmCoverageAction}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default ShiftGeneratorPage

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { AlertTriangle, Download, Eye, Radio, RefreshCw, Send } from "lucide-react"
import { apiDelete, apiGet, apiPost } from "@/lib/apiClient"
import { syncScheduleAssignments } from "@/lib/scheduleApi"
import { resolveTbaApiKey } from "@/lib/tbaUtils"
import { generateShiftSchedule, type GeneratedSchedule, type ScoutInput } from "@/lib/shiftGenerator"
import type { StoredScheduleState } from "@/types/schedule"

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
  attendees: AttendeeEntry[]
}

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

const ShiftGeneratorPage = () => {
  const { roleAssignments, recentUsers } = useAuth()

  // ─── Persisted state ────────────────────────────────────────────────────
  const [eventKey, setEventKey] = useState("")
  const [shiftSize, setShiftSize] = useState(7)
  const [attendees, setAttendees] = useState<AttendeeEntry[]>([])

  // ─── TBA watch ──────────────────────────────────────────────────────────
  const [watchStatus, setWatchStatus] = useState<WatchStatus>({
    watching: false, released: false, eventKey: null, matchCount: null,
  })
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── Generated schedule ──────────────────────────────────────────────────
  const [generated, setGenerated] = useState<GeneratedSchedule | null>(null)
  const [publishing, setPublishing] = useState(false)

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
      if (!raw) return
      const stored = JSON.parse(raw) as PersistedState
      if (stored.eventKey) setEventKey(stored.eventKey)
      if (stored.shiftSize) setShiftSize(stored.shiftSize)
      if (Array.isArray(stored.attendees)) setAttendees(stored.attendees)
    } catch {
      // ignore
    }
  }, [])

  // ─── Sync attendee list when registered scouts change ────────────────────
  useEffect(() => {
    setAttendees((prev) => {
      const existingByEmail = new Map(prev.map((a) => [a.email, a]))
      return registeredScouts.map((scout) => {
        const existing = existingByEmail.get(scout.email)
        return existing
          ? { ...existing, displayName: scout.displayName }
          : { email: scout.email, displayName: scout.displayName, present: false, load: 2 as LoadPref }
      })
    })
  }, [registeredScouts])

  // ─── Persist state ────────────────────────────────────────────────────────
  useEffect(() => {
    const state: PersistedState = { eventKey, shiftSize, attendees }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  }, [eventKey, shiftSize, attendees])

  // ─── Fetch TBA watch status on mount ─────────────────────────────────────
  useEffect(() => {
    apiGet<WatchStatus>("/schedule/watch-status")
      .then((status) => setWatchStatus(status))
      .catch(() => {})
  }, [])

  // ─── Attendee helpers ─────────────────────────────────────────────────────
  const setPresent = (email: string, present: boolean) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, present } : a))

  const setLoad = (email: string, load: LoadPref) =>
    setAttendees((prev) => prev.map((a) => a.email === email ? { ...a, load } : a))

  const presentAttendees = attendees.filter((a) => a.present)
  const totalSlots = presentAttendees.reduce((sum, a) => sum + a.load, 0)
  const estimatedShifts = shiftSize > 0 ? Math.ceil((watchStatus.matchCount ?? 72) / shiftSize) : 0

  // ─── TBA Watch ────────────────────────────────────────────────────────────
  const startWatch = useCallback(async () => {
    const key = eventKey.trim()
    if (!key) { toast.error("Enter an event key first"); return }
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

  const stopWatch = useCallback(async () => {
    try {
      await apiDelete("/schedule/watch")
      setWatchStatus({ watching: false, released: false, eventKey: null, matchCount: null })
      toast.info("Watch stopped")
    } catch {
      toast.error("Failed to stop watch")
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
  const generate = () => {
    const scouts: ScoutInput[] = presentAttendees.map((a) => ({
      email: a.email,
      displayName: a.displayName,
      targetShifts: a.load,
    }))
    if (scouts.length === 0) { toast.error("Check in at least one scout first"); return }

    const totalMatches = watchStatus.matchCount ?? 72
    const result = generateShiftSchedule({ scouts, totalMatches, shiftSize })
    setGenerated(result)
    if (result.warnings.length > 0) {
      toast.warning(`Generated with ${result.warnings.length} warning(s)`)
    } else {
      toast.success("Schedule generated")
    }
  }

  // ─── Publish ──────────────────────────────────────────────────────────────
  const publish = async () => {
    if (!generated) return
    if (!eventKey.trim()) { toast.error("Set an event key before publishing"); return }
    setPublishing(true)
    try {
      const state: StoredScheduleState = {
        eventKey: eventKey.trim(),
        matches: [],
        assignments: generated.assignments,
        aliases: {},
        mode: "manual",
      }
      localStorage.setItem(SCHEDULE_KEY, JSON.stringify(state))
      window.dispatchEvent(new Event("scheduleAutomationUpdated"))

      await syncScheduleAssignments({
        eventKey: eventKey.trim(),
        matches: [],
        assignments: generated.assignments,
      })
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
          <div className="flex gap-2">
            <div className="flex-1">
              <Label htmlFor="event-key">Event Key</Label>
              <Input
                id="event-key"
                placeholder="e.g. 2026njfla"
                value={eventKey}
                onChange={(e) => setEventKey(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            {watchStatus.watching ? (
              <Button variant="outline" size="sm" onClick={stopWatch}>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Stop Watching
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={startWatch} disabled={watchStatus.released}>
                <Radio className="h-4 w-4 mr-2" />
                Watch for Schedule Release
              </Button>
            )}

            {watchStatus.released && (
              <Badge variant="default" className="bg-green-600">
                Schedule released — {watchStatus.matchCount} qual matches
              </Badge>
            )}
            {watchStatus.watching && !watchStatus.released && (
              <span className="text-sm text-muted-foreground">Polling TBA every 60s…</span>
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
          <div className="flex items-end gap-3">
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
                    {generated.warnings.length} warning{generated.warnings.length !== 1 ? "s" : ""}
                  </div>
                  {generated.warnings.map((w, i) => (
                    <p key={i} className="text-xs text-yellow-700 dark:text-yellow-300 ml-6">{w}</p>
                  ))}
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
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"] as const).map((pos, idx) => {
                      const label = { "red-1": "Red 1", "red-2": "Red 2", "red-3": "Red 3", "blue-1": "Blue 1", "blue-2": "Blue 2", "blue-3": "Blue 3" }[pos]
                      const isRed = pos.startsWith("red")
                      return (
                        <tr key={pos} className={`border-b last:border-0 ${idx % 2 === 0 ? "bg-background" : "bg-muted/20"}`}>
                          <td className={`px-3 py-2 font-medium ${isRed ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                            {label}
                          </td>
                          {generated.shiftRanges.map((range) => {
                            // Find the scout for this position in this shift's first match
                            const firstMatch = generated.assignments.find(
                              (a) => parseInt(a.matchNumber.replace(/\D/g, "")) === range.start
                            )
                            const email = firstMatch?.positions[pos] ?? ""
                            const scout = presentAttendees.find((a) => a.email === email)
                            return (
                              <td key={range.label} className="px-3 py-2 whitespace-nowrap">
                                {scout?.displayName ?? email ?? "—"}
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
                <Button onClick={publish} disabled={publishing || !eventKey.trim()}>
                  <Send className="h-4 w-4 mr-2" />
                  {publishing ? "Publishing…" : "Publish to Scouts"}
                </Button>
                <Button variant="outline" onClick={downloadCsv}>
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV
                </Button>
              </div>
              {!eventKey.trim() && (
                <p className="text-xs text-muted-foreground">Set an event key above to enable publishing.</p>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

export default ShiftGeneratorPage

import { useEffect, useMemo, useRef, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { toast } from "sonner"
import { PLAYER_POSITIONS, type ParsedMatch, type MatchAssignment, type PlayerPosition, type StoredScheduleState } from "@/types/schedule"
import { fetchRemoteSchedule, syncScheduleAssignments } from "@/lib/scheduleApi"

const STORAGE_KEY = "schedule_automation_state"

const normalizeHeader = (header: string) => header.trim().toLowerCase()

const normalizeTeam = (value: string | undefined) => {
  if (!value) return ""
  return value.replace(/frc/i, "").trim()
}

const parseCsv = (raw: string): ParsedMatch[] => {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (rows.length < 2) {
    throw new Error("CSV requires a header row and at least one match row")
  }

  const headers = rows[0].split(",").map(normalizeHeader)

  const headerIndex = (targets: string[]) => {
    const idx = headers.findIndex((header) => targets.includes(header))
    return idx >= 0 ? idx : undefined
  }

  const matchIdx = headerIndex(["match", "matchnumber", "match_number", "match #", "matchno"])
  const red1Idx = headerIndex(["red1", "r1"])
  const red2Idx = headerIndex(["red2", "r2"])
  const red3Idx = headerIndex(["red3", "r3"])
  const blue1Idx = headerIndex(["blue1", "b1"])
  const blue2Idx = headerIndex(["blue2", "b2"])
  const blue3Idx = headerIndex(["blue3", "b3"])
  const timeIdx = headerIndex(["starttime", "time", "scheduled", "start"])

  if (
    matchIdx === undefined ||
    red1Idx === undefined ||
    red2Idx === undefined ||
    red3Idx === undefined ||
    blue1Idx === undefined ||
    blue2Idx === undefined ||
    blue3Idx === undefined
  ) {
    throw new Error("CSV must include match number plus red1-3 and blue1-3 columns")
  }

  const matches: ParsedMatch[] = []

  rows.slice(1).forEach((row) => {
    const columns = row.split(",")
    if (columns.length === 0) return

    const matchNumber = columns[matchIdx]?.trim()
    if (!matchNumber) return

    matches.push({
      matchNumber,
      startTime: timeIdx !== undefined ? columns[timeIdx]?.trim() || undefined : undefined,
      red: [normalizeTeam(columns[red1Idx]), normalizeTeam(columns[red2Idx]), normalizeTeam(columns[red3Idx])],
      blue: [normalizeTeam(columns[blue1Idx]), normalizeTeam(columns[blue2Idx]), normalizeTeam(columns[blue3Idx])],
    })
  })

  return matches
}

// New: Support importing scout rotation CSV like the provided example
type RotationBlock = {
  range: { start: number; end: number }
  positions: Record<PlayerPosition, string>
}

const normalizeName = (name: string | undefined) => (name || "").replace(/\s+/g, " ").trim()

const parseMatchRange = (value: string): { start: number; end: number } | null => {
  const v = value.trim()
  // Extract all numbers from the string
  const numbers = v.match(/\d+/g)
  if (!numbers || numbers.length === 0) return null
  
  if (numbers.length === 1) {
    const num = parseInt(numbers[0], 10)
    if (!Number.isFinite(num)) return null
    return { start: num, end: num }
  }
  
  // If multiple numbers, treat first as start and last as end
  const start = parseInt(numbers[0], 10)
  const end = parseInt(numbers[numbers.length - 1], 10)
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start: Math.min(start, end), end: Math.max(start, end) }
}

const isRotationHeader = (headers: string[]): boolean => {
  const h = headers.map((x) => x.trim().toLowerCase())
  const need = ["red 1", "red 2", "red 3", "blue 1", "blue 2", "blue 3"]
  const hasAll = need.every((k) => h.includes(k))
  return hasAll
}

const parseRotationCsv = (raw: string): RotationBlock[] => {
  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (rows.length < 2) throw new Error("Rotation CSV requires a header and at least one row")
  const headers = rows[0].split(",").map((h) => h.trim())
  if (!isRotationHeader(headers)) throw new Error("CSV does not match rotation format")

  const headerIndex = (label: string) => headers.findIndex((h) => h.trim().toLowerCase() === label)
  const idxRange = 0 // first column is match range or label
  const idxR1 = headerIndex("red 1")
  const idxR2 = headerIndex("red 2")
  const idxR3 = headerIndex("red 3")
  const idxB1 = headerIndex("blue 1")
  const idxB2 = headerIndex("blue 2")
  const idxB3 = headerIndex("blue 3")

  if ([idxR1, idxR2, idxR3, idxB1, idxB2, idxB3].some((v) => v < 0)) {
    throw new Error("Missing one or more position columns in rotation CSV")
  }

  const blocks: RotationBlock[] = []
  rows.slice(1).forEach((row) => {
    const cols = row.split(",")
    const rangeText = cols[idxRange]?.trim() || ""
    if (!rangeText) return
    const range = parseMatchRange(rangeText)
    if (!range) return
    const positions: Record<PlayerPosition, string> = {
      "red-1": normalizeName(cols[idxR1]),
      "red-2": normalizeName(cols[idxR2]),
      "red-3": normalizeName(cols[idxR3]),
      "blue-1": normalizeName(cols[idxB1]),
      "blue-2": normalizeName(cols[idxB2]),
      "blue-3": normalizeName(cols[idxB3]),
    }
    blocks.push({ range, positions })
  })
  return blocks
}

const buildAssignments = (matches: ParsedMatch[], scouts: string[]): MatchAssignment[] => {
  if (matches.length === 0) return []

  if (scouts.length === 0) {
    return matches.map((match) => ({
      matchNumber: match.matchNumber,
      startTime: match.startTime,
      positions: PLAYER_POSITIONS.reduce((acc, position) => {
        acc[position] = "Unassigned"
        return acc
      }, {} as Record<PlayerPosition, string>),
    }))
  }

  let pointer = 0

  return matches.map((match) => {
    const positions = PLAYER_POSITIONS.reduce((acc, position) => {
      const scout = scouts[pointer % scouts.length]
      acc[position] = scout
      pointer += 1
      return acc
    }, {} as Record<PlayerPosition, string>)

    return {
      matchNumber: match.matchNumber,
      startTime: match.startTime,
      positions,
    }
  })
}

const ScheduleAutomationPage = () => {
  const { roleAssignments, recentUsers, allianceProfiles } = useAuth()
  const restoredState = useMemo(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (!stored) return null
      return JSON.parse(stored) as StoredScheduleState
    } catch (error) {
      console.warn("Failed to restore schedule state", error)
      return null
    }
  }, [])

  const [eventKey, setEventKey] = useState(restoredState?.eventKey ?? "")
  const [matches, setMatches] = useState<ParsedMatch[]>(restoredState?.matches ?? [])
  const [assignments, setAssignments] = useState<MatchAssignment[]>(restoredState?.assignments ?? [])
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [mode, setMode] = useState<"auto" | "manual">(restoredState?.mode ?? "auto")
  const [aliases, setAliases] = useState<Record<string, string>>(restoredState?.aliases ?? {})
  const [unresolvedNames, setUnresolvedNames] = useState<string[]>([])
  const [showAliasDialog, setShowAliasDialog] = useState(false)

  const syncTimeoutRef = useRef<number | null>(null)
  const latestSyncedPayloadRef = useRef<string>("")
  const hasFetchedRemoteRef = useRef(false)

  useEffect(() => {
    if (hasFetchedRemoteRef.current) {
      return
    }

    hasFetchedRemoteRef.current = true
    let cancelled = false

    const loadRemote = async () => {
      try {
        const remote = await fetchRemoteSchedule()
        if (cancelled || !remote) return

        if (remote.eventKey && remote.eventKey.trim()) {
          setEventKey((current) => {
            if (current && current.trim()) {
              return current
            }
            return remote.eventKey ?? ""
          })
        }

        if (Array.isArray(remote.matches) && remote.matches.length) {
          setMatches(remote.matches as ParsedMatch[])
        }

        if (Array.isArray(remote.assignments) && remote.assignments.length) {
          setAssignments(remote.assignments as MatchAssignment[])
          const detectedManual = remote.mode === "manual" || remote.assignments.some((assignment) =>
            PLAYER_POSITIONS.some((position) => {
              const value = assignment.positions?.[position]
              return typeof value === "string" && value.includes("@")
            })
          )
          const effectiveMode: "auto" | "manual" = remote.mode ? (remote.mode === "manual" ? "manual" : "auto") : detectedManual ? "manual" : "auto"
          setMode(effectiveMode)
        } else if (remote.mode) {
          setMode(remote.mode === "manual" ? "manual" : "auto")
        }

        if (remote.aliases && Object.keys(remote.aliases).length) {
          setAliases(remote.aliases)
        }
      } catch (error) {
        console.warn("Failed to load schedule state from API", error)
      }
    }

    void loadRemote()

    return () => {
      cancelled = true
    }
  }, [])

  // Build roster for name->email mapping
  const roster = useMemo(() => {
    const emails = Object.keys(roleAssignments)
    type Entry = { email: string; displayName?: string; firstName?: string; lastName?: string }
    const map: Entry[] = emails.map((email) => {
      const profile = allianceProfiles[email]
      const ru = recentUsers.find((u) => u.email === email)
      return {
        email,
        displayName: ru?.displayName || undefined,
        firstName: profile?.firstName || undefined,
        lastName: profile?.lastName || undefined,
      }
    })
    return map
  }, [roleAssignments, allianceProfiles, recentUsers])

  const nameToEmail = useMemo(() => {
    const byDisplay = new Map<string, string>()
    const byFull = new Map<string, string>()
    const byAlias = new Map<string, string>()
    
    roster.forEach((r) => {
      if (r.displayName) byDisplay.set(normalizeName(r.displayName).toLowerCase(), r.email)
      const full = normalizeName(`${r.firstName || ""} ${r.lastName || ""}`).toLowerCase().trim()
      if (full) byFull.set(full, r.email)
    })
    
    // Add stored aliases
    Object.entries(aliases).forEach(([name, email]) => {
      byAlias.set(normalizeName(name).toLowerCase(), email)
    })
    
    return (name: string): string => {
      const key = normalizeName(name).toLowerCase()
      return byAlias.get(key) || byDisplay.get(key) || byFull.get(key) || name
    }
  }, [roster, aliases])

  const availableScouts = useMemo(
    () =>
      Object.entries(roleAssignments)
        .filter(([, role]) => role !== "pending")
        .map(([email]) => email),
    [roleAssignments]
  )

  useEffect(() => {
    if (mode === "manual") return
    if (matches.length === 0) {
      setAssignments([])
      return
    }
    setAssignments(buildAssignments(matches, availableScouts))
  }, [matches, availableScouts, mode])

  useEffect(() => {
    const payload: StoredScheduleState = {
      eventKey,
      matches,
      assignments,
      aliases,
      mode,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    window.dispatchEvent(new Event("scheduleAutomationUpdated"))
  }, [eventKey, matches, assignments, aliases, mode])

  useEffect(() => {
    if (!eventKey.trim()) {
      return
    }

    const payloadHash = JSON.stringify({ eventKey, matches, assignments, aliases, mode })
    if (payloadHash === latestSyncedPayloadRef.current && !syncTimeoutRef.current) {
      return
    }

    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current)
    }

    syncTimeoutRef.current = window.setTimeout(async () => {
      syncTimeoutRef.current = null
      try {
        await syncScheduleAssignments({ eventKey, matches, assignments, aliases })
        latestSyncedPayloadRef.current = payloadHash
      } catch (error) {
        console.warn("Failed to sync schedule assignments", error)
      }
    }, 700)

    return () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current)
        syncTimeoutRef.current = null
      }
    }
  }, [eventKey, matches, assignments, aliases, mode])

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      // Try rotation first
      const firstLine = text.split(/\r?\n/)[0] || ""
      const headers = firstLine.split(",").map((h) => h.trim().toLowerCase())
      if (isRotationHeader(headers)) {
        const blocks = parseRotationCsv(text)
        // Build manual assignments
        const built: Record<string, MatchAssignment> = {}
        const unresolved: Set<string> = new Set()
        
        blocks.forEach((block) => {
          for (let n = block.range.start; n <= block.range.end; n++) {
            const matchKey = String(n)
            const positions: Record<PlayerPosition, string> = { ...block.positions }
            // Map names to emails where possible, track unresolved
            const mapped: Record<PlayerPosition, string> = {
              "red-1": "",
              "red-2": "",
              "red-3": "",
              "blue-1": "",
              "blue-2": "",
              "blue-3": "",
            };
            
            (["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"] as PlayerPosition[]).forEach((pos) => {
              const orig = positions[pos]
              if (!orig || orig.length === 0) {
                mapped[pos] = ""
                return
              }
              const resolved = nameToEmail(orig)
              mapped[pos] = resolved
              // Check if it's still a name (not an email)
              if (resolved === orig && !resolved.includes("@")) {
                unresolved.add(orig)
              }
            })
            
            built[matchKey] = { matchNumber: matchKey, positions: mapped, startTime: undefined }
          }
        })
        const result = Object.values(built).sort((a, b) => parseInt(a.matchNumber) - parseInt(b.matchNumber))
        setAssignments(result)
        setMode("manual")
        // Populate matches list for counters/preview
        const derived: ParsedMatch[] = result.map((a) => ({ matchNumber: a.matchNumber, red: [], blue: [] }))
        setMatches(derived)
        setUploadError(null)
        
        // Show alias dialog if unresolved names exist
        if (unresolved.size > 0) {
          setUnresolvedNames(Array.from(unresolved))
          setShowAliasDialog(true)
          toast.info(`Found ${unresolved.size} unresolved name(s). Please map them to profiles.`)
        } else {
          toast.success(`Loaded rotation with ${result.length} matches`)
        }
      } else {
        // Fallback to team-based schedule CSV
        const parsedMatches = parseCsv(text)
        setMatches(parsedMatches)
        setMode("auto")
        setUploadError(null)
        toast.success(`Loaded ${parsedMatches.length} matches from CSV`)
      }
    } catch (error) {
      console.error(error)
      const message = error instanceof Error ? error.message : "Failed to parse CSV"
      setUploadError(message)
      toast.error(message)
    } finally {
      event.target.value = ""
    }
  }

  const downloadTemplate = () => {
    const template = [
      ",Red 1,Red 2,Red 3,Blue 1,Blue 2,Blue 3",
      "Match 1-6,Ananya Sen,Aiden Berkowitz,Braden Rothchild,Avani Dave,Paige Lee,Benjamin Smith",
      "Match 7-12,Avani Dave,Benjamin Smith,Ananya Sen,Braden Rothchild,Aiden Berkowitz,Paige Lee",
      "Match 13-18,Paige Lee,Avani Dave,Aiden Berkowitz,Ananya Sen,Braden Rothchild,Benjamin Smith",
    ].join("\n")

    const blob = new Blob([template], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = "scouting_rotation_template.csv"
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("Template downloaded")
  }

  const exportAssignments = () => {
    if (assignments.length === 0) {
      toast.error("Nothing to export yet.")
      return
    }

    const header = ["matchNumber", "startTime", ...PLAYER_POSITIONS]
    const rows = assignments.map((assignment) => {
      const positionValues = PLAYER_POSITIONS.map((position) => assignment.positions[position])
      return [assignment.matchNumber, assignment.startTime ?? "", ...positionValues].join(",")
    })

    const csv = [header.join(","), ...rows].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `${eventKey || "schedule"}_assignments.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    toast.success("Assignments exported")
  }

  const clearSchedule = () => {
    if (!confirm("Are you sure you want to clear the entire schedule? This cannot be undone.")) return
    setMatches([])
    setAssignments([])
    setEventKey("")
    setAliases({})
    localStorage.removeItem(STORAGE_KEY)
    toast.success("Cleared stored schedule")
  }

  // Manual builder state
  const [rangeText, setRangeText] = useState("")
  const [blockPositions, setBlockPositions] = useState<Record<PlayerPosition, string>>({
    "red-1": "__UNASSIGNED__",
    "red-2": "__UNASSIGNED__",
    "red-3": "__UNASSIGNED__",
    "blue-1": "__UNASSIGNED__",
    "blue-2": "__UNASSIGNED__",
    "blue-3": "__UNASSIGNED__",
  })
  const [editingMatch, setEditingMatch] = useState<string | null>(null)
  const [expandedView, setExpandedView] = useState(false)

  const addBlock = () => {
    const range = parseMatchRange(rangeText || "")
    if (!range) {
      toast.error("Enter a match range like 1-6 or Match 7-12")
      return
    }
    const positions: Record<PlayerPosition, string> = { ...blockPositions };
    // Replace __UNASSIGNED__ sentinel with empty string
    positions["red-1"] = positions["red-1"] === "__UNASSIGNED__" ? "" : positions["red-1"]
    positions["red-2"] = positions["red-2"] === "__UNASSIGNED__" ? "" : positions["red-2"]
    positions["red-3"] = positions["red-3"] === "__UNASSIGNED__" ? "" : positions["red-3"]
    positions["blue-1"] = positions["blue-1"] === "__UNASSIGNED__" ? "" : positions["blue-1"]
    positions["blue-2"] = positions["blue-2"] === "__UNASSIGNED__" ? "" : positions["blue-2"]
    positions["blue-3"] = positions["blue-3"] === "__UNASSIGNED__" ? "" : positions["blue-3"];
    // Validate at least one position filled
    const filled = (Object.values(positions).filter((v) => normalizeName(v).length > 0).length)
    if (filled === 0) {
      toast.error("Assign at least one position in the block")
      return
    }
    const built: MatchAssignment[] = []
    for (let n = range.start; n <= range.end; n++) {
      const matchNumber = String(n)
      const pos: Record<PlayerPosition, string> = {
        "red-1": positions["red-1"] ? nameToEmail(positions["red-1"]) : assignments.find(a => a.matchNumber===matchNumber)?.positions["red-1"] || "",
        "red-2": positions["red-2"] ? nameToEmail(positions["red-2"]) : assignments.find(a => a.matchNumber===matchNumber)?.positions["red-2"] || "",
        "red-3": positions["red-3"] ? nameToEmail(positions["red-3"]) : assignments.find(a => a.matchNumber===matchNumber)?.positions["red-3"] || "",
        "blue-1": positions["blue-1"] ? nameToEmail(positions["blue-1"]) : assignments.find(a => a.matchNumber===matchNumber)?.positions["blue-1"] || "",
        "blue-2": positions["blue-2"] ? nameToEmail(positions["blue-2"]) : assignments.find(a => a.matchNumber===matchNumber)?.positions["blue-2"] || "",
        "blue-3": positions["blue-3"] ? nameToEmail(positions["blue-3"]) : assignments.find(a => a.matchNumber===matchNumber)?.positions["blue-3"] || "",
      }
      built.push({ matchNumber, startTime: undefined, positions: pos })
    }
    // Merge with existing assignments (manual mode)
    const mergedMap: Record<string, MatchAssignment> = {}
    ;[...assignments, ...built].forEach((a) => { mergedMap[a.matchNumber] = { ...mergedMap[a.matchNumber], ...a, positions: { ...(mergedMap[a.matchNumber]?.positions || {}), ...a.positions } } })
    const merged = Object.values(mergedMap).sort((a, b) => parseInt(a.matchNumber) - parseInt(b.matchNumber))
    setAssignments(merged)
    // Update matches list
    const derived: ParsedMatch[] = merged.map((a) => ({ matchNumber: a.matchNumber, red: [], blue: [] }))
    setMatches(derived)
    setMode("manual")
    toast.success(`Applied block to matches ${range.start}-${range.end}`)
  }

  const assignedPositions = useMemo(() => {
    if (assignments.length === 0) return { filled: 0, total: 0 }
    let filled = 0
    let total = 0

    assignments.forEach((assignment) => {
      PLAYER_POSITIONS.forEach((position) => {
        total += 1
        if (assignment.positions[position] && assignment.positions[position] !== "Unassigned") {
          filled += 1
        }
      })
    })

    return { filled, total }
  }, [assignments])

  const displayList = expandedView ? assignments : assignments.slice(0, 15)

  const updatePosition = (matchNumber: string, position: PlayerPosition, value: string) => {
    setAssignments((prev) =>
      prev.map((a) =>
        a.matchNumber === matchNumber
          ? { ...a, positions: { ...a.positions, [position]: value } }
          : a
      )
    )
  }

  const deleteMatch = (matchNumber: string) => {
    if (!confirm(`Delete match ${matchNumber} from the schedule?`)) return
    setAssignments((prev) => prev.filter((a) => a.matchNumber !== matchNumber))
    setMatches((prev) => prev.filter((m) => m.matchNumber !== matchNumber))
    toast.success(`Match ${matchNumber} removed`)
  }

  return (
    <div className="container mx-auto max-w-7xl py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Scout Schedule</h1>
          <p className="text-muted-foreground mt-1">
            Import rotation schedules, assign scouts, and manage match coverage
          </p>
        </div>
        {assignments.length > 0 && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={exportAssignments}>
              Export CSV
            </Button>
            <Button variant="destructive" onClick={clearSchedule}>
              Clear Schedule
            </Button>
          </div>
        )}
      </div>

      {/* Stats Cards */}
      {assignments.length > 0 && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Total Matches</CardDescription>
              <CardTitle className="text-3xl">{matches.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Available Scouts</CardDescription>
              <CardTitle className="text-3xl">{availableScouts.length}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Positions Filled</CardDescription>
              <CardTitle className="text-3xl">{assignedPositions.filled} / {assignedPositions.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardDescription>Event Key</CardDescription>
              <CardTitle className="text-2xl">{eventKey || "—"}</CardTitle>
            </CardHeader>
          </Card>
        </div>
      )}

      {/* Import Section */}
      <Card>
        <CardHeader>
          <CardTitle>Import Schedule</CardTitle>
          <CardDescription>
            Upload a CSV with scout rotation blocks or download the template to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="schedule-file">Upload CSV File</Label>
              <Input id="schedule-file" type="file" accept=".csv" onChange={handleFileUpload} />
              {uploadError && <p className="text-sm text-destructive">{uploadError}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="event-key">Event Key (Optional)</Label>
              <Input
                id="event-key"
                value={eventKey}
                placeholder="e.g., 2025mrcmp"
                onChange={(event) => setEventKey(event.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={downloadTemplate}>
              Download Template
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Manual Builder */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Add Rotation Block</CardTitle>
          <CardDescription>
            Manually assign scouts to a range of matches (e.g., Match 1-6)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-7">
            <div className="space-y-2 md:col-span-1">
              <Label htmlFor="match-range">Match Range</Label>
              <Input id="match-range" placeholder="1-6" value={rangeText} onChange={(e) => setRangeText(e.target.value)} />
            </div>
            {(["red-1","red-2","red-3","blue-1","blue-2","blue-3"] as PlayerPosition[]).map((pos) => (
              <div className="space-y-2" key={pos}>
                <Label className="text-xs">{pos.toUpperCase()}</Label>
                <Select value={blockPositions[pos]} onValueChange={(v) => setBlockPositions((p) => ({ ...p, [pos]: v }))}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Scout" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__UNASSIGNED__">—</SelectItem>
                    {roster.map((r) => {
                      const displayLabel = r.displayName || `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.email
                      return (
                        <SelectItem key={r.email} value={displayLabel}>
                          {displayLabel}
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={addBlock}>Apply Block</Button>
            <Button variant="outline" onClick={() => { setRangeText(""); setBlockPositions({"red-1":"__UNASSIGNED__","red-2":"__UNASSIGNED__","red-3":"__UNASSIGNED__","blue-1":"__UNASSIGNED__","blue-2":"__UNASSIGNED__","blue-3":"__UNASSIGNED__"}) }}>
              Reset
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Schedule Preview/Editor */}
      {assignments.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Schedule Editor</CardTitle>
                <CardDescription>
                  {expandedView ? `Showing all ${assignments.length} matches` : `Showing first ${displayList.length} of ${assignments.length} matches`}
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" onClick={() => setExpandedView(!expandedView)}>
                {expandedView ? "Show Less" : "Show All"}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {displayList.map((assignment) => (
                <div key={assignment.matchNumber} className="group relative rounded-lg border p-4 hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-20">
                      <p className="text-sm font-medium text-muted-foreground">Match</p>
                      <p className="text-2xl font-bold">{assignment.matchNumber}</p>
                    </div>
                    <div className="flex-1 grid grid-cols-3 gap-4 md:grid-cols-6">
                      {PLAYER_POSITIONS.map((position) => {
                        const isEditing = editingMatch === `${assignment.matchNumber}-${position}`
                        const currentValue = assignment.positions[position]
                        const displayName = currentValue && currentValue.includes("@")
                          ? roster.find((r) => r.email === currentValue)?.displayName || 
                            `${roster.find((r) => r.email === currentValue)?.firstName || ""} ${roster.find((r) => r.email === currentValue)?.lastName || ""}`.trim() ||
                            currentValue
                          : currentValue

                        return (
                          <div key={position} className="space-y-1">
                            <Label className="text-xs text-muted-foreground">{position.toUpperCase()}</Label>
                            {isEditing ? (
                              <Select
                                value={currentValue || "__NONE__"}
                                onValueChange={(v) => {
                                  updatePosition(assignment.matchNumber, position, v === "__NONE__" ? "" : v)
                                  setEditingMatch(null)
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="__NONE__">—</SelectItem>
                                  {roster.map((r) => (
                                    <SelectItem key={r.email} value={r.email}>
                                      {r.displayName || `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.email}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <button
                                className="w-full text-left text-sm rounded px-2 py-1 hover:bg-accent hover:text-accent-foreground transition-colors"
                                onClick={() => setEditingMatch(`${assignment.matchNumber}-${position}`)}
                              >
                                {displayName || "—"}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => deleteMatch(assignment.matchNumber)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Alias resolution dialog */}
      <Dialog open={showAliasDialog} onOpenChange={setShowAliasDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Map scouts to profiles</DialogTitle>
            <DialogDescription>
              Some names in your schedule don't match existing profiles. Select who each person is to create an alias.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {unresolvedNames.map((name) => (
              <div key={name} className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{name}</span>
                </div>
                <span className="text-muted-foreground">→</span>
                <Select
                  value={aliases[name] || "__NONE__"}
                  onValueChange={(email) => {
                    if (email === "__NONE__") {
                      const { [name]: removed, ...rest } = aliases
                      void removed
                      setAliases(rest)
                    } else {
                      setAliases((prev) => ({ ...prev, [name]: email }))
                    }
                  }}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select profile" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__NONE__">Skip this name</SelectItem>
                    {roster.map((r) => {
                      const label = r.displayName || `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.email
                      return (
                        <SelectItem key={r.email} value={r.email}>
                          {label} <span className="text-muted-foreground">({r.email})</span>
                        </SelectItem>
                      )
                    })}
                  </SelectContent>
                </Select>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowAliasDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowAliasDialog(false)
                // Re-process assignments with new aliases
                const rebuilt = assignments.map((a) => {
                  const newPos: Record<PlayerPosition, string> = { ...a.positions };
                  (["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"] as PlayerPosition[]).forEach((pos) => {
                    const val = a.positions[pos]
                    if (val && !val.includes("@")) {
                      const resolved = nameToEmail(val)
                      if (resolved !== val) {
                        newPos[pos] = resolved
                      }
                    }
                  })
                  return { ...a, positions: newPos }
                })
                setAssignments(rebuilt)
                toast.success("Aliases saved and applied")
              }}
            >
              Apply
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ScheduleAutomationPage

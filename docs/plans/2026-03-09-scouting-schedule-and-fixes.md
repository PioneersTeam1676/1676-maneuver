# Scouting Schedule System & Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CSV-based scouting schedule import, auto-fill team from assignments, fix team selector bugs, add schedule broadcast push notifications, and add a match correlation outlier detection view for admins.

**Architecture:** Schedule data lives server-side in the existing `ScoutScheduleAssignment` Prisma model. The client fetches the current scout's assignment per match to auto-fill alliance/team/position. Push notifications are sent to all subscribed scouts when a schedule is uploaded or updated. Outlier detection compares synced scouting entries against expected assignments.

**Tech Stack:** React 19 + TypeScript, Express.js, Prisma/MySQL, web-push, Dexie (IndexedDB), Tailwind/shadcn

---

## Bug Fixes First (no new infrastructure needed)

---

### Task 1: Fix Team Position Persistence Bug

**Root cause:** In `GameStartSelectTeam.tsx`, `getInitialTeamSelection()` checks `defaultSelectTeam` before `preferredTeamPosition`. When a scout returns from a completed match, their previous team bleeds into the custom field for the new match because it doesn't match the new match's alliance teams.

**Files:**
- Modify: `src/components/GameStartComponents/GameStartSelectTeam.tsx:81-111`

**Step 1: Read the current `getInitialTeamSelection` logic**

Lines 81–111 of `GameStartSelectTeam.tsx`. Observe that `if (defaultSelectTeam)` is checked first, before `preferredTeamPosition`.

**Step 2: Swap the priority order**

Replace the `getInitialTeamSelection` function body so `preferredTeamPosition` takes priority when it's set:

```typescript
const getInitialTeamSelection = () => {
  // Preferred position from schedule assignment wins over any persisted value
  if (preferredTeamPosition >= 1 && preferredTeamPosition <= 3) {
    return {
      team1: preferredTeamPosition === 1,
      team2: preferredTeamPosition === 2,
      team3: preferredTeamPosition === 3,
      custom: false,
    };
  }

  // Fall back to a previously-selected team (e.g. restored session state),
  // but only if that team is actually in the current alliance list.
  if (defaultSelectTeam && baseTeams.includes(defaultSelectTeam)) {
    return {
      team1: defaultSelectTeam === baseTeams[0],
      team2: defaultSelectTeam === baseTeams[1],
      team3: defaultSelectTeam === baseTeams[2],
      custom: false,
    };
  }

  return { team1: false, team2: false, team3: false, custom: false };
};
```

**Step 3: Also reset selection when match or alliance changes**

Add a `useEffect` after the existing `useEffect` blocks (around line 194) to clear state when the user moves to a different match:

```typescript
// Reset when the user changes to a different match or alliance
useEffect(() => {
  setTeam1Status(false);
  setTeam2Status(false);
  setTeam3Status(false);
  setCustomTeamStatus(false);
  setCustomTeamValue("");
}, [selectedMatch, selectedAlliance]);
```

**Step 4: Manual QA**
1. Start a scouting session, complete match 1 with team 1234.
2. Return to GameStart.
3. Change match number to 2 — team buttons should reset and auto-select position 1 (or preferred position), NOT show 1234 in custom field.

**Step 5: Commit**

```bash
git add src/components/GameStartComponents/GameStartSelectTeam.tsx
git commit -m "fix: prioritize preferredTeamPosition over stale defaultSelectTeam in team selector"
```

---

## Schedule Infrastructure

---

### Task 2: Add Scout Assignment Lookup API Endpoint

Scouts need to fetch their own assignment for the current event to know which alliance/position/team they're assigned. The existing `/schedule/assignments` GET returns all assignments — we need a per-scout endpoint.

**Files:**
- Modify: `server/src/routes/schedule.js`
- Modify: `server/src/services/scheduleNotifications.js`

**Step 1: Add `getMyAssignments` service function**

In `scheduleNotifications.js`, add after `getScheduleState`:

```javascript
/**
 * Returns all assignments for a specific scout email on an event.
 * Each entry includes matchNumber, position, alliance, slotIndex, teams.
 */
const getMyAssignments = async ({ eventKey, email }) => {
  const normalizedEmail = normalizeEmail(email)
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)

  const assignments = await seasonPrisma.scoutScheduleAssignment.findMany({
    where: { eventKey, scoutEmail: normalizedEmail },
    orderBy: { matchOrder: "asc" },
  })

  return assignments.map((a) => {
    const positionDetails = POSITION_DETAILS[a.position] || {}
    return {
      matchNumber: a.matchNumber,
      matchOrder: a.matchOrder,
      position: a.position,
      alliance: positionDetails.alliance ?? null,
      slotIndex: positionDetails.slotIndex ?? null, // 0-based, +1 = teamPosition (1,2,3)
    }
  })
}

module.exports = {
  // ... existing exports ...
  getMyAssignments,
}
```

**Step 2: Add GET `/schedule/my-assignments` route**

In `schedule.js`:

```javascript
const { replaceScheduleAssignments, getScheduleState, getMyAssignments } = require("../services/scheduleNotifications")
const { requireAuth } = require("../middleware/apiAuth") // check existing middleware name

router.get(
  "/my-assignments",
  requireAuth,
  asyncHandler(async (req, res) => {
    const { eventKey } = req.query
    if (!eventKey) return res.status(400).json({ error: "eventKey required" })
    const email = req.user?.email
    if (!email) return res.status(401).json({ error: "not authenticated" })
    const assignments = await getMyAssignments({ eventKey, email })
    res.json({ assignments })
  })
)
```

> Note: Check the actual middleware export name in `server/src/middleware/apiAuth.js` — it may be `authenticate`, `requireRole`, etc.

**Step 3: Commit**

```bash
git add server/src/routes/schedule.js server/src/services/scheduleNotifications.js
git commit -m "feat: add GET /schedule/my-assignments endpoint for per-scout lookups"
```

---

### Task 3: Auto-Fill Team from Schedule Assignment on GameStart

When a scout opens GameStart and selects their match, the app should fetch their assignment and pre-select the correct alliance, position, and team.

**Files:**
- Modify: `src/pages/GameStartPage.tsx`
- Create: `src/lib/scheduleApi.ts`

**Step 1: Create `scheduleApi.ts` client**

```typescript
// src/lib/scheduleApi.ts
import { apiClient } from "@/lib/apiClient"

export interface MyAssignment {
  matchNumber: string
  matchOrder: number | null
  position: string       // "red-1", "blue-3", etc.
  alliance: string | null  // "red" | "blue"
  slotIndex: number | null // 0, 1, or 2 (add 1 to get teamPosition)
}

export async function fetchMyAssignments(eventKey: string): Promise<MyAssignment[]> {
  const data = await apiClient<{ assignments: MyAssignment[] }>(
    `/schedule/my-assignments?eventKey=${encodeURIComponent(eventKey)}`
  )
  return data.assignments
}
```

**Step 2: Add assignment fetch in `GameStartPage.tsx`**

Import and add state near the top of `GameStartPage.tsx`:

```typescript
import { fetchMyAssignments, type MyAssignment } from "@/lib/scheduleApi"

// Inside component, after existing state declarations:
const [myAssignments, setMyAssignments] = useState<MyAssignment[]>([])

useEffect(() => {
  if (!eventName) return
  fetchMyAssignments(eventName)
    .then(setMyAssignments)
    .catch(() => {}) // silently fail — not every event has a schedule
}, [eventName])
```

**Step 3: Derive assignment for the current match**

```typescript
const currentAssignment = useMemo(
  () => myAssignments.find((a) => a.matchNumber === matchNumber) ?? null,
  [myAssignments, matchNumber]
)
```

**Step 4: Auto-set alliance and preferred position from assignment**

```typescript
// After currentAssignment is defined:
useEffect(() => {
  if (!currentAssignment) return
  if (currentAssignment.alliance) setAlliance(currentAssignment.alliance)
}, [currentAssignment])
```

Pass `preferredTeamPosition` from assignment:

```tsx
preferredTeamPosition={
  currentAssignment?.slotIndex != null
    ? currentAssignment.slotIndex + 1
    : stationInfo.teamPosition
}
```

**Step 5: Show assignment info near the match selector**

Add a small badge/hint when an assignment exists:

```tsx
{currentAssignment && (
  <p className="text-sm text-muted-foreground">
    Assigned: {currentAssignment.position.replace("-", " ").toUpperCase()}
  </p>
)}
```

**Step 6: Manual QA**
1. Upload a test schedule (see Task 4 below).
2. Open GameStart as a scout whose email matches an assignment.
3. Select their match — alliance should auto-set, correct team position button should be highlighted.

**Step 7: Commit**

```bash
git add src/lib/scheduleApi.ts src/pages/GameStartPage.tsx
git commit -m "feat: auto-fill alliance and team position from schedule assignment on GameStart"
```

---

### Task 4: CSV Schedule Import UI

Admins need to upload a schedule from a CSV file. The expected format matches the existing `POST /schedule/assignments` payload format.

**Expected CSV format (one row per match, 6 scout columns):**

```
match_number,red_1,red_2,red_3,blue_1,blue_2,blue_3
qm1,alice@team.com,bob@team.com,carol@team.com,dave@team.com,eve@team.com,frank@team.com
qm2,...
```

Alternatively support the "name" alias format where column values are names and an aliases section maps name → email.

**Files:**
- Create: `src/lib/scheduleCSVParser.ts`
- Modify: `src/pages/EventSettingsPage.tsx`
- Modify: `server/src/routes/schedule.js` (auth guard only if missing)

**Step 1: Create CSV parser utility**

```typescript
// src/lib/scheduleCSVParser.ts

export interface ParsedSchedule {
  assignments: {
    matchNumber: string
    position: string  // "red-1" ... "blue-3"
    scoutEmail: string
  }[]
  aliases: Record<string, string>  // name → email (empty if CSV uses emails directly)
  errors: string[]
}

const POSITION_KEYS = ["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"]
const HEADER_ALIASES: Record<string, string> = {
  red_1: "red-1", red_2: "red-2", red_3: "red-3",
  blue_1: "blue-1", blue_2: "blue-2", blue_3: "blue-3",
  red1: "red-1", red2: "red-2", red3: "red-3",
  blue1: "blue-1", blue2: "blue-2", blue3: "blue-3",
}

export function parseScheduleCSV(csvText: string): ParsedSchedule {
  const lines = csvText.trim().split(/\r?\n/)
  if (lines.length < 2) return { assignments: [], aliases: {}, errors: ["CSV has no data rows"] }

  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase())
  const matchCol = headers.findIndex((h) => h === "match_number" || h === "match" || h === "qm")
  if (matchCol === -1) return { assignments: [], aliases: {}, errors: ["Missing match_number column"] }

  const positionCols: { position: string; colIndex: number }[] = []
  headers.forEach((h, i) => {
    const pos = HEADER_ALIASES[h]
    if (pos) positionCols.push({ position: pos, colIndex: i })
  })

  const assignments: ParsedSchedule["assignments"] = []
  const errors: string[] = []
  const namesSeen = new Set<string>()

  for (let row = 1; row < lines.length; row++) {
    const cols = lines[row].split(",").map((c) => c.trim())
    const matchNumber = cols[matchCol]
    if (!matchNumber) continue

    for (const { position, colIndex } of positionCols) {
      const value = cols[colIndex]
      if (!value) continue
      namesSeen.add(value)
      assignments.push({ matchNumber, position, scoutEmail: value })
    }
  }

  // Detect if values look like emails or just names
  const looksLikeEmail = (s: string) => s.includes("@")
  const hasEmails = [...namesSeen].some(looksLikeEmail)
  const hasNames = [...namesSeen].some((s) => !looksLikeEmail(s))

  if (hasNames && hasEmails) {
    errors.push("CSV mixes email addresses and plain names — normalize before uploading")
  }

  return { assignments, aliases: {}, errors }
}
```

**Step 2: Add CSV upload card to `EventSettingsPage.tsx`**

Find the last `<Card>` in EventSettingsPage and add a new card after it:

```tsx
{/* Schedule CSV Upload */}
<Card>
  <CardHeader>
    <CardTitle>Upload Scouting Schedule</CardTitle>
    <CardDescription>
      CSV format: match_number, red_1, red_2, red_3, blue_1, blue_2, blue_3
      (emails or names with alias map)
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-3">
    <Input
      type="file"
      accept=".csv"
      onChange={handleScheduleCSVChange}
    />
    {schedulePreview && (
      <p className="text-sm text-muted-foreground">
        Parsed {schedulePreview.assignments.length} assignments across{" "}
        {new Set(schedulePreview.assignments.map((a) => a.matchNumber)).size} matches.
        {schedulePreview.errors.length > 0 && (
          <span className="text-destructive"> Errors: {schedulePreview.errors.join("; ")}</span>
        )}
      </p>
    )}
    <Button
      disabled={!schedulePreview || schedulePreview.errors.length > 0 || uploadingSchedule}
      onClick={handleScheduleUpload}
    >
      {uploadingSchedule ? "Uploading…" : "Upload Schedule"}
    </Button>
  </CardContent>
</Card>
```

**Step 3: Add state and handlers in `EventSettingsPage.tsx`**

```typescript
import { parseScheduleCSV, type ParsedSchedule } from "@/lib/scheduleCSVParser"
import { apiClient } from "@/lib/apiClient"

// State
const [schedulePreview, setSchedulePreview] = useState<ParsedSchedule | null>(null)
const [uploadingSchedule, setUploadingSchedule] = useState(false)

// Handlers
const handleScheduleCSVChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (ev) => {
    const text = ev.target?.result as string
    setSchedulePreview(parseScheduleCSV(text))
  }
  reader.readAsText(file)
}

const handleScheduleUpload = async () => {
  if (!schedulePreview || !currentEvent) return
  setUploadingSchedule(true)
  try {
    await apiClient("/schedule/assignments", {
      method: "POST",
      body: JSON.stringify({
        eventKey: currentEvent,
        assignments: schedulePreview.assignments,
        matches: [],
        aliases: schedulePreview.aliases,
      }),
    })
    toast.success("Schedule uploaded successfully")
    setSchedulePreview(null)
  } catch (err) {
    toast.error("Failed to upload schedule")
  } finally {
    setUploadingSchedule(false)
  }
}
```

**Step 4: Manual QA**
1. Create a test CSV with 3 matches and 6 scout emails.
2. Open EventSettingsPage, upload CSV — preview shows correct count.
3. Click Upload — no errors.
4. Verify assignments appear via `GET /schedule/assignments?eventKey=...`.

**Step 5: Commit**

```bash
git add src/lib/scheduleCSVParser.ts src/pages/EventSettingsPage.tsx
git commit -m "feat: add CSV schedule import with parse preview in EventSettingsPage"
```

---

## Push Notifications

---

### Task 5: Broadcast Push Notification on Schedule Upload/Update

When a schedule is uploaded (new or replacement), all subscribed scouts should receive a push notification.

**Files:**
- Modify: `server/src/services/scheduleNotifications.js`
- Modify: `server/src/routes/schedule.js`

**Step 1: Add `notifyScheduleReleased` function in `scheduleNotifications.js`**

This sends a push to every subscription in the database (or only those affected by the event).

```javascript
/**
 * Sends a "schedule released/updated" push to all subscribed scouts.
 * @param {object} opts
 * @param {string} opts.eventKey
 * @param {boolean} opts.isUpdate - true if replacing an existing schedule
 */
const notifyScheduleReleased = async ({ eventKey, isUpdate = false }) => {
  if (!pushEnabled) return

  const subscriptions = await mainPrisma.pushSubscription.findMany()
  if (!subscriptions.length) return

  const title = isUpdate
    ? "Scouting Schedule Updated"
    : "Scouting Schedule Released"
  const body = `The scouting schedule for ${eventKey} has been ${isUpdate ? "updated" : "published"}. Check your assignments.`

  const payload = JSON.stringify({
    title,
    body,
    tag: `schedule-${eventKey}-${isUpdate ? "update" : "release"}`,
    data: { url: "/schedule" },
  })

  const results = await Promise.allSettled(
    subscriptions.map((sub) => {
      const pushSub = {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      }
      return webpush.sendNotification(pushSub, payload)
    })
  )

  const failed = results.filter((r) => r.status === "rejected").length
  if (failed > 0) {
    console.warn(`notifyScheduleReleased: ${failed}/${subscriptions.length} pushes failed`)
  }
}

module.exports = {
  // ... existing exports ...
  notifyScheduleReleased,
}
```

**Step 2: Check if schedule already exists before uploading (to distinguish new vs. update)**

In `schedule.js`, update the POST handler:

```javascript
const { replaceScheduleAssignments, getScheduleState, getMyAssignments, notifyScheduleReleased } =
  require("../services/scheduleNotifications")

router.post(
  "/assignments",
  asyncHandler(async (req, res) => {
    const { eventKey, assignments, matches, aliases } = req.body || {}
    if (!eventKey || typeof eventKey !== "string" || !eventKey.trim()) {
      return res.status(400).json({ error: "eventKey is required" })
    }

    // Check if this event already has assignments (to label as update vs. new)
    const existingState = await getScheduleState(eventKey)
    const isUpdate = existingState?.assignments?.length > 0

    await replaceScheduleAssignments({
      eventKey,
      assignments: Array.isArray(assignments) ? assignments : [],
      matches: Array.isArray(matches) ? matches : [],
      aliases: aliases && typeof aliases === "object" ? aliases : {},
    })

    // Fire-and-forget broadcast — don't block the response
    notifyScheduleReleased({ eventKey, isUpdate }).catch((err) =>
      console.error("Failed to send schedule notification", err)
    )

    res.json({ success: true })
  })
)
```

**Step 3: Add a client-side "Schedule" page stub (just a placeholder for now)**

Scouts will receive a notification pointing to `/schedule`. Create a minimal page:

```typescript
// src/pages/SchedulePage.tsx
export default function SchedulePage() {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">My Schedule</h1>
      <p className="text-muted-foreground">Schedule view coming soon.</p>
    </div>
  )
}
```

Add route in `src/App.tsx`:
```tsx
<Route path="/schedule" element={<SchedulePage />} />
```

Add sidebar link in `src/components/DashboardComponents/app-sidebar.tsx` (follow existing pattern).

**Step 4: Manual QA**
1. Have at least one device subscribed to push notifications.
2. Upload a CSV schedule — device should receive "Scouting Schedule Released" push.
3. Upload again — device should receive "Scouting Schedule Updated" push.

**Step 5: Commit**

```bash
git add server/src/services/scheduleNotifications.js server/src/routes/schedule.js \
        src/pages/SchedulePage.tsx src/App.tsx \
        src/components/DashboardComponents/app-sidebar.tsx
git commit -m "feat: broadcast push notification to all scouts when schedule is uploaded or updated"
```

---

### Task 6: Per-Scout Schedule View Page

Replace the placeholder `/schedule` page with a real view showing the scout's own upcoming assignments.

**Files:**
- Modify: `src/pages/SchedulePage.tsx`

**Step 1: Implement the schedule view**

```tsx
// src/pages/SchedulePage.tsx
import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/AuthContext"
import { fetchMyAssignments, type MyAssignment } from "@/lib/scheduleApi"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function SchedulePage() {
  const { user } = useAuth()
  const [assignments, setAssignments] = useState<MyAssignment[]>([])
  const [loading, setLoading] = useState(true)

  const eventName = localStorage.getItem("eventName") ?? ""

  useEffect(() => {
    if (!eventName) return setLoading(false)
    fetchMyAssignments(eventName)
      .then(setAssignments)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventName])

  if (loading) return <div className="p-6">Loading schedule…</div>
  if (!assignments.length)
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-2">My Schedule</h1>
        <p className="text-muted-foreground">No assignments found for {eventName || "this event"}.</p>
      </div>
    )

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">My Schedule — {eventName}</h1>
      <div className="space-y-2">
        {assignments.map((a) => (
          <Card key={a.matchNumber}>
            <CardHeader className="pb-1">
              <CardTitle className="text-base">Match {a.matchNumber}</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={a.alliance === "red" ? "destructive" : "default"}>
                {a.position.replace("-", " ").toUpperCase()}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
```

**Step 2: Commit**

```bash
git add src/pages/SchedulePage.tsx
git commit -m "feat: implement scout schedule view page with per-event assignments"
```

---

## Match Correlation / Outlier Detection

---

### Task 7: Match Correlation Outlier Detection (Admin View)

When scouts sync entries, some may have reported the wrong match number. By comparing each entry's `matchNumber` against the expected assignment for that scout's email at roughly the same timestamp, we can flag discrepancies.

**Algorithm:**
- Fetch all scouting entries for an event from the server.
- For each scout email, fetch their assignments (match → position).
- For each entry, find what match the scout should have been scouting at that timestamp using ScheduleProgress or a time-window approach.
- Flag entries where `entry.matchNumber !== expectedMatchNumber` AND at least 4 of the other 5 scouts for that match submitted consistently.

**Files:**
- Create: `server/src/services/outlierDetection.js`
- Modify: `server/src/routes/scouting.js` (add admin endpoint)
- Create: `src/pages/OutlierDetectionPage.tsx`

**Step 1: Create outlier detection service**

```javascript
// server/src/services/outlierDetection.js
const { getSeasonPrismaForEvent } = require("../seasonDb")

/**
 * For each scouting entry in an event, check if the reported matchNumber
 * matches what the schedule expected for that scout.
 *
 * Returns flagged entries with:
 *   - entryId, scoutEmail, reportedMatch, expectedMatch, confidence
 */
const detectOutliers = async ({ eventKey }) => {
  const seasonPrisma = await getSeasonPrismaForEvent(eventKey)

  // Load all entries for this event
  const entries = await seasonPrisma.scoutingEntry.findMany({
    where: { eventName: eventKey },
    select: {
      id: true,
      scoutName: true,
      matchNumber: true,
      alliance: true,
      timestamp: true,
    },
  })

  // Load all assignments for this event
  const assignments = await seasonPrisma.scoutScheduleAssignment.findMany({
    where: { eventKey },
    select: { scoutEmail: true, matchNumber: true, matchOrder: true },
  })

  // Build map: scoutEmail → Set of assigned matchNumbers
  const assignmentMap = new Map()
  for (const a of assignments) {
    if (!assignmentMap.has(a.scoutEmail)) assignmentMap.set(a.scoutEmail, [])
    assignmentMap.get(a.scoutEmail).push(a.matchNumber)
  }

  // Group entries by matchNumber to find consensus
  const byMatch = new Map()
  for (const e of entries) {
    const key = e.matchNumber
    if (!byMatch.has(key)) byMatch.set(key, [])
    byMatch.get(key).push(e)
  }

  const flagged = []

  for (const entry of entries) {
    const scoutEmail = entry.scoutName // entries store scoutName (may be email or name)
    const assignedMatches = assignmentMap.get(scoutEmail) || []

    if (!assignedMatches.length) continue // no schedule for this scout, skip

    const expectedMatch = assignedMatches.find(
      (m) => m === entry.matchNumber
    )

    if (expectedMatch) continue // matches assignment, good

    // Scout reported a match they weren't assigned to
    // Find which match they WERE assigned around this timestamp
    // (naive: check if any assigned match has consensus with other scouts)
    const consensusGroup = [...byMatch.entries()]
      .map(([matchNum, group]) => ({
        matchNum,
        count: group.filter((e2) => e2.id !== entry.id).length,
      }))
      .filter(({ matchNum }) => assignedMatches.includes(matchNum))
      .sort((a, b) => b.count - a.count)

    const likelyMatch = consensusGroup[0]?.matchNum ?? null

    flagged.push({
      entryId: entry.id,
      scoutEmail,
      reportedMatch: entry.matchNumber,
      expectedMatches: assignedMatches,
      likelyCorrectMatch: likelyMatch,
      timestamp: entry.timestamp,
    })
  }

  return flagged
}

module.exports = { detectOutliers }
```

**Step 2: Add admin endpoint in `scouting.js`**

```javascript
const { detectOutliers } = require("../services/outlierDetection")

router.get(
  "/outliers",
  requireAdmin, // whatever your admin middleware is
  asyncHandler(async (req, res) => {
    const { eventKey } = req.query
    if (!eventKey) return res.status(400).json({ error: "eventKey required" })
    const outliers = await detectOutliers({ eventKey })
    res.json({ outliers })
  })
)
```

**Step 3: Create OutlierDetectionPage.tsx**

```tsx
// src/pages/OutlierDetectionPage.tsx
import { useEffect, useState } from "react"
import { apiClient } from "@/lib/apiClient"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertTriangle } from "lucide-react"

interface Outlier {
  entryId: string
  scoutEmail: string
  reportedMatch: string
  expectedMatches: string[]
  likelyCorrectMatch: string | null
  timestamp: number
}

export default function OutlierDetectionPage() {
  const [outliers, setOutliers] = useState<Outlier[]>([])
  const [loading, setLoading] = useState(true)
  const eventKey = localStorage.getItem("eventName") ?? ""

  useEffect(() => {
    if (!eventKey) return setLoading(false)
    apiClient<{ outliers: Outlier[] }>(`/scouting/outliers?eventKey=${encodeURIComponent(eventKey)}`)
      .then((d) => setOutliers(d.outliers))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [eventKey])

  if (loading) return <div className="p-6">Analyzing entries…</div>

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold flex items-center gap-2">
        <AlertTriangle className="h-6 w-6 text-amber-500" />
        Match Outlier Detection
      </h1>
      <p className="text-muted-foreground text-sm">
        Entries where the scout reported a match number that doesn't match their schedule.
      </p>
      {outliers.length === 0 ? (
        <p className="text-green-600">No outliers found.</p>
      ) : (
        outliers.map((o) => (
          <Card key={o.entryId} className="border-amber-400">
            <CardHeader className="pb-1">
              <CardTitle className="text-base">{o.scoutEmail}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <p>
                Reported: <Badge variant="destructive">Match {o.reportedMatch}</Badge>
              </p>
              <p>Assigned to: {o.expectedMatches.join(", ")}</p>
              {o.likelyCorrectMatch && (
                <p className="text-amber-600">
                  Likely correct match: <strong>{o.likelyCorrectMatch}</strong>
                </p>
              )}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}
```

**Step 4: Add route and sidebar link (admin-only)**

In `App.tsx` add:
```tsx
<Route path="/outliers" element={<RequireRole role="admin"><OutlierDetectionPage /></RequireRole>} />
```

In app-sidebar, add under admin tools section (follow existing pattern for role-gated links).

**Step 5: Manual QA**
1. Upload a schedule where alice@team.com is assigned to qm1.
2. Manually insert (or sync) a scouting entry from alice for qm2.
3. Open `/outliers` as admin — alice's entry should appear as flagged.

**Step 6: Commit**

```bash
git add server/src/services/outlierDetection.js server/src/routes/scouting.js \
        src/pages/OutlierDetectionPage.tsx src/App.tsx \
        src/components/DashboardComponents/app-sidebar.tsx
git commit -m "feat: add match outlier detection for admin review of wrong-match submissions"
```

---

## Summary of Changes

| Feature | Files Changed |
|---|---|
| Fix team selector bug | `GameStartSelectTeam.tsx` |
| Assignment API | `schedule.js`, `scheduleNotifications.js` |
| Auto-fill from schedule | `GameStartPage.tsx`, `scheduleApi.ts` |
| CSV import | `scheduleCSVParser.ts`, `EventSettingsPage.tsx` |
| Schedule broadcast push | `scheduleNotifications.js`, `schedule.js` |
| Schedule view page | `SchedulePage.tsx`, `App.tsx`, `app-sidebar.tsx` |
| Outlier detection | `outlierDetection.js`, `scouting.js`, `OutlierDetectionPage.tsx` |

## Execution Order

1. Task 1 (bug fix) — independent, do first
2. Task 2 (API endpoint) — needed before Task 3
3. Task 3 (auto-fill) — depends on Task 2
4. Task 4 (CSV import) — independent, can do in parallel with Task 2-3
5. Task 5 (broadcast push) — depends on Task 4 (upload triggers notification)
6. Task 6 (schedule page) — depends on Task 2
7. Task 7 (outlier detection) — depends on Task 4 (needs schedule data)

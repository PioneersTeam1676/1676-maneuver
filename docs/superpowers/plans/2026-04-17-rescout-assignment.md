# Rescout Assignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add tech-lead rescout assignment with push notification + fix game-start team pre-selection bug.

**Architecture:** New `RescoutAssignment` Prisma model in main DB; three new routes on `/rescout`; `RescouterPage` gains checkbox multi-select + assign dialog + updated card display; `GameStartPage` reads `states.inputs.teamPosition`/`teamNumber` that the rescout flow already passes but nothing consumes.

**Tech Stack:** Express/Prisma (backend), React 19/TypeScript/Tailwind/shadcn-ui (frontend), existing `sendManualNotification` for push.

> **No automated test suite.** TDD steps replaced with manual verification instructions.

---

## File Map

| File | Action |
|------|--------|
| `server/prisma/schema.prisma` | Add `RescoutAssignment` model |
| `server/src/routes/rescout.js` | Add POST/GET/DELETE `/assignments` routes |
| `src/pages/GameStartPage.tsx` | Fix `selectTeam` init + `preferredTeamPosition` fallback |
| `src/pages/RescouterPage.tsx` | Assignment UI: checkboxes, dialog, updated cards |

---

## Task 1: Add RescoutAssignment Prisma Model

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add model to schema**

Append to `server/prisma/schema.prisma` (after the `RescoutClaim` model):

```prisma
model RescoutAssignment {
  id              Int      @id @default(autoincrement())
  eventKey        String   @map("event_key") @db.VarChar(255)
  matchNumber     String   @map("match_number") @db.VarChar(255)
  alliance        String   @db.VarChar(16)
  position        String   @db.VarChar(16)
  originalScout   String   @map("original_scout") @db.VarChar(255)
  assigneeEmail   String   @map("assignee_email") @db.VarChar(255)
  assigneeName    String   @map("assignee_name") @db.VarChar(255)
  assignedByEmail String   @map("assigned_by_email") @db.VarChar(255)
  note            String?  @db.VarChar(500)
  assignedAt      DateTime @default(now()) @map("assigned_at")

  @@unique([eventKey, matchNumber, position])
  @@index([eventKey, assigneeEmail], map: "idx_rescout_assignment_email")
  @@map("rescout_assignments")
}
```

- [ ] **Step 2: Push schema to DB**

Run inside server directory (or exec into container):

```bash
cd server && npx prisma db push
```

Expected output includes: `Your database is now in sync with your Prisma schema.`

If running via Docker exec:
```bash
docker compose exec api npx prisma db push
```

- [ ] **Step 3: Verify table exists**

```bash
docker compose exec api node -e "
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.rescoutAssignment.count().then(n => { console.log('count:', n); p.\$disconnect(); });
"
```

Expected: `count: 0`

- [ ] **Step 4: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat: add RescoutAssignment prisma model"
```

---

## Task 2: Backend Routes for Rescout Assignments

**Files:**
- Modify: `server/src/routes/rescout.js`

- [ ] **Step 1: Add imports at top of rescout.js**

The file already imports `prisma`, `asyncHandler`, `nowSeconds`, and defines `requireTechLead`. Add `sendManualNotification` import:

```js
const { sendManualNotification } = require("../services/scheduleNotifications")
```

Add this line after the existing `require` statements at the top of `server/src/routes/rescout.js`.

- [ ] **Step 2: Add GET /rescout/assignments route**

Add before `module.exports = router` in `server/src/routes/rescout.js`:

```js
// GET /rescout/assignments?eventKey=X — all assignments for event
router.get(
  "/assignments",
  asyncHandler(async (req, res) => {
    const { eventKey } = req.query
    if (!eventKey || typeof eventKey !== "string") {
      return res.status(400).json({ error: "eventKey query param required" })
    }
    const assignments = await prisma.rescoutAssignment.findMany({
      where: { eventKey: eventKey.trim() },
      orderBy: { assignedAt: "asc" },
    })
    res.json({ assignments })
  })
)
```

- [ ] **Step 3: Add POST /rescout/assignments route**

Add after the GET route, before `module.exports`:

```js
// POST /rescout/assignments — tech lead batch-assigns rescout matches; sends one push
router.post(
  "/assignments",
  asyncHandler(async (req, res) => {
    if (!(await requireTechLead(req, res))) return

    const { eventKey, matches, assigneeEmail, assigneeName, note } = req.body
    if (!eventKey || !Array.isArray(matches) || matches.length === 0 || !assigneeEmail || !assigneeName) {
      return res.status(400).json({ error: "eventKey, matches, assigneeEmail, assigneeName required" })
    }

    const assignedByEmail = String(req.user?.email || "").trim().toLowerCase()
    const normalizedAssignee = String(assigneeEmail).trim().toLowerCase()
    const now = new Date()

    const results = await Promise.all(
      matches.map((m) =>
        prisma.rescoutAssignment.upsert({
          where: {
            eventKey_matchNumber_position: {
              eventKey: String(eventKey).trim(),
              matchNumber: String(m.matchNumber),
              position: String(m.position),
            },
          },
          create: {
            eventKey: String(eventKey).trim(),
            matchNumber: String(m.matchNumber),
            alliance: String(m.alliance),
            position: String(m.position),
            originalScout: String(m.originalScout || ""),
            assigneeEmail: normalizedAssignee,
            assigneeName: String(assigneeName),
            assignedByEmail,
            note: note ? String(note).slice(0, 500) : null,
            assignedAt: now,
          },
          update: {
            alliance: String(m.alliance),
            originalScout: String(m.originalScout || ""),
            assigneeEmail: normalizedAssignee,
            assigneeName: String(assigneeName),
            assignedByEmail,
            note: note ? String(note).slice(0, 500) : null,
            assignedAt: now,
          },
        })
      )
    )

    const matchNumbers = matches.map((m) => m.matchNumber).join(", ")
    const bodyText = note
      ? `Matches ${matchNumbers} at ${eventKey}. ${note}`
      : `Matches ${matchNumbers} at ${eventKey} — tap to view.`

    const notifyResult = await sendManualNotification({
      email: normalizedAssignee,
      title: "You've been assigned rescout matches",
      body: bodyText,
      url: "/rescout",
      tag: `rescout-assignment-${eventKey}-${normalizedAssignee}-${Date.now()}`,
    })

    res.status(201).json({ assignments: results, notified: notifyResult.success })
  })
)
```

- [ ] **Step 4: Add DELETE /rescout/assignments/:id route**

Add after the POST route, before `module.exports`:

```js
// DELETE /rescout/assignments/:id — tech lead removes assignment
router.delete(
  "/assignments/:id",
  asyncHandler(async (req, res) => {
    if (!(await requireTechLead(req, res))) return

    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" })

    await prisma.rescoutAssignment.delete({ where: { id } }).catch(() => null)
    res.status(204).end()
  })
)
```

- [ ] **Step 5: Rebuild Docker container and verify routes**

```bash
docker compose up --build -d
```

Test routes manually:
```bash
# Should return 400 (no eventKey)
curl -s http://localhost:4001/api/rescout/assignments | jq .

# Should return { assignments: [] } for a real event key
curl -s "http://localhost:4001/api/rescout/assignments?eventKey=2025test" | jq .
```

- [ ] **Step 6: Commit**

```bash
git add server/src/routes/rescout.js
git commit -m "feat: add GET/POST/DELETE /rescout/assignments routes"
```

---

## Task 3: Fix Game-Start Team Pre-Selection

**Files:**
- Modify: `src/pages/GameStartPage.tsx`

**Context:** `RescouterPage` navigates to `/game-start` with:
```js
state: { inputs: { matchNumber, alliance, teamPosition: match.slotIndex, teamNumber: match.teamNumber } }
```
`slotIndex` is 0-based (0=position1, 1=position2, 2=position3). `GameStartPage` never reads these two fields.

- [ ] **Step 1: Fix selectTeam initialization**

In `src/pages/GameStartPage.tsx`, find line:
```js
  const [selectTeam, setSelectTeam] = useState(states?.inputs?.selectTeam || "");
```

Replace with:
```js
  const [selectTeam, setSelectTeam] = useState(states?.inputs?.selectTeam || states?.inputs?.teamNumber || "");
```

- [ ] **Step 2: Fix preferredTeamPosition**

Find the `preferredTeamPosition` prop passed to `GameStartSelectTeam` (around line 613):
```js
                preferredTeamPosition={
                  currentAssignment?.slotIndex != null
                    ? currentAssignment.slotIndex + 1
                    : stationInfo.teamPosition
                }
```

Replace with:
```js
                preferredTeamPosition={
                  currentAssignment?.slotIndex != null
                    ? currentAssignment.slotIndex + 1
                    : states?.inputs?.teamPosition != null
                      ? Number(states.inputs.teamPosition) + 1
                      : stationInfo.teamPosition
                }
```

- [ ] **Step 3: Verify manually**

1. Start dev server: `npm run dev`
2. On RescouterPage, click "Scout this" on any missing match card
3. Confirm game-start page pre-selects the correct alliance + team position button (e.g. if position is Red 2, the Red alliance button is active and position 2 button is highlighted)

- [ ] **Step 4: Commit**

```bash
git add src/pages/GameStartPage.tsx
git commit -m "fix: pre-select correct team position and team number from rescout navigation state"
```

---

## Task 4: Rescout Assignment UI

**Files:**
- Modify: `src/pages/RescouterPage.tsx`

**Context:** 
- `useAuth()` exposes `role`, `rescouterPermissions` (Record<email, boolean>), `recentUsers` (RecentUserRecord[])
- Tech lead check: `role === 'tech_lead'`
- Scout picker: filter `rescouterPermissions` for `enabled === true`, look up display names in `recentUsers`
- shadcn components available: `Dialog`, `DialogContent`, `DialogHeader`, `DialogTitle`, `DialogFooter`, `Checkbox`, `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue`, `Textarea` (check if exists) or `Input`

- [ ] **Step 1: Add imports to RescouterPage**

Replace the existing import block at the top of `src/pages/RescouterPage.tsx` with:

```tsx
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { toast } from "sonner"
import { Youtube, RefreshCw, ClipboardCheck, X } from "lucide-react"
```

- [ ] **Step 2: Add RescoutAssignment interface and update state**

After the existing `ActiveClaim` interface, add:

```tsx
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
  note?: string | null
  assignedAt: string
}
```

In the component, after the existing state declarations, add:

```tsx
  const { user, canRescout, role, rescouterPermissions, recentUsers } = useAuth()
  const isTechLead = role === "tech_lead"

  const [assignments, setAssignments] = useState<RescoutAssignment[]>([])
  const [selectedSlots, setSelectedSlots] = useState<Set<string>>(new Set())
  const [assignDialogOpen, setAssignDialogOpen] = useState(false)
  const [assigneeEmail, setAssigneeEmail] = useState("")
  const [assignNote, setAssignNote] = useState("")
  const [assigning, setAssigning] = useState(false)
```

Also update the existing `useAuth` destructure — replace the existing:
```tsx
  const { user, canRescout } = useAuth()
```
with the new destructure above (already includes `user` and `canRescout`).

- [ ] **Step 3: Add fetchAssignments and update useEffect**

Add `fetchAssignments` callback alongside `fetchClaims`:

```tsx
  const fetchAssignments = useCallback(async () => {
    if (!eventKey) return
    try {
      const data = await apiGet<{ assignments: RescoutAssignment[] }>(
        `/rescout/assignments?eventKey=${encodeURIComponent(eventKey)}`
      )
      setAssignments(data.assignments ?? [])
    } catch {
      // non-critical
    }
  }, [eventKey])
```

In `loadMissing`, after `await fetchClaims()`, add:
```tsx
      await fetchAssignments()
```

Also update `loadMissing`'s `useCallback` dependency array — find:
```tsx
  }, [eventKey, fetchClaims])
```
Replace with:
```tsx
  }, [eventKey, fetchClaims, fetchAssignments])
```

- [ ] **Step 4: Add scout picker options derived from rescouterPermissions**

Add this `useMemo` after the `eventKey` memo:

```tsx
  const rescouterOptions = useMemo(() => {
    return Object.entries(rescouterPermissions)
      .filter(([, enabled]) => enabled)
      .map(([email]) => {
        const found = recentUsers.find((u) => u.email === email)
        return { email, displayName: found?.displayName || email }
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName))
  }, [rescouterPermissions, recentUsers])
```

- [ ] **Step 5: Add slot key helper and handleAssign**

Add helpers after the `rescouterOptions` memo:

```tsx
  const slotKey = (m: MissingMatch) =>
    `${m.matchNumber}::${m.position}`

  const toggleSlot = (m: MissingMatch) => {
    const key = slotKey(m)
    setSelectedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const handleAssign = async () => {
    if (!assigneeEmail || selectedSlots.size === 0) return
    const chosen = rescouterOptions.find((o) => o.email === assigneeEmail)
    if (!chosen) return

    const matchesToAssign = missing.filter((m) => selectedSlots.has(slotKey(m)))

    setAssigning(true)
    try {
      await apiPost("/rescout/assignments", {
        eventKey,
        matches: matchesToAssign.map((m) => ({
          matchNumber: m.matchNumber,
          alliance: m.alliance,
          position: m.position,
          originalScout: m.assignedScout,
        })),
        assigneeEmail: chosen.email,
        assigneeName: chosen.displayName,
        note: assignNote.trim() || undefined,
      })
      toast.success(`Assigned ${matchesToAssign.length} match${matchesToAssign.length === 1 ? "" : "es"} to ${chosen.displayName}`)
      setAssignDialogOpen(false)
      setSelectedSlots(new Set())
      setAssignNote("")
      setAssigneeEmail("")
      await fetchAssignments()
    } catch {
      toast.error("Failed to assign matches")
    } finally {
      setAssigning(false)
    }
  }

  const handleUnassign = async (assignmentId: number) => {
    try {
      await apiDelete(`/rescout/assignments/${assignmentId}`)
      setAssignments((prev) => prev.filter((a) => a.id !== assignmentId))
      toast.success("Assignment removed")
    } catch {
      toast.error("Failed to remove assignment")
    }
  }
```

- [ ] **Step 6: Build assignment lookup map**

Add after `handleUnassign`:

```tsx
  const assignmentBySlot = useMemo(() => {
    const map = new Map<string, RescoutAssignment>()
    for (const a of assignments) {
      map.set(`${a.matchNumber}::${a.position}`, a)
    }
    return map
  }, [assignments])
```

- [ ] **Step 7: Update match card rendering**

Replace the entire `{!loading && missing.map((m) => {` block with:

```tsx
      {!loading && missing.map((m) => {
        const claimForSlot = claims.find(
          (c) =>
            c.matchNumber === m.matchNumber &&
            c.alliance.toLowerCase() === m.alliance.toLowerCase() &&
            c.position === m.position &&
            c.eventKey === m.eventKey
        )
        const claimedByMe = claimForSlot?.scoutEmail === myEmail
        const claimedByOther = !!claimForSlot && !claimedByMe
        const ytKey = videoKeys[m.matchNumNormalized]
        const assignment = assignmentBySlot.get(slotKey(m))
        const isSelected = selectedSlots.has(slotKey(m))

        return (
          <Card key={`${m.matchNumNormalized}-${m.position}`} className={isSelected ? "ring-2 ring-primary" : ""}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {isTechLead && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleSlot(m)}
                      aria-label="Select match for assignment"
                    />
                  )}
                  <CardTitle className="text-base">
                    Match {m.matchNumNormalized} — {m.position.toUpperCase()}
                  </CardTitle>
                </div>
                <div className="flex items-center gap-2">
                  {ytKey && (
                    <a
                      href={`https://www.youtube.com/watch?v=${ytKey}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-muted-foreground hover:text-red-500 transition-colors"
                      title="Watch on YouTube"
                    >
                      <Youtube className="h-4 w-4" />
                    </a>
                  )}
                  <Badge
                    className={
                      m.alliance === "Red"
                        ? "bg-red-500/15 text-red-600 border-red-500/30"
                        : "bg-blue-500/15 text-blue-600 border-blue-500/30"
                    }
                    variant="outline"
                  >
                    {m.alliance}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {assignment ? (
                <div className="space-y-1">
                  <div className="text-sm">
                    Rescout: <span className="font-medium text-foreground">{assignment.assigneeName}</span>
                    {isTechLead && (
                      <button
                        onClick={() => handleUnassign(assignment.id)}
                        className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                        title="Remove assignment"
                      >
                        <X className="h-3 w-3 inline" />
                      </button>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Originally: {m.assignedScout}
                  </div>
                  {assignment.note && (
                    <div className="text-xs text-muted-foreground italic">{assignment.note}</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">
                  Team <span className="font-medium text-foreground">{m.teamNumber}</span>
                  {" · "}Originally: <span className="font-medium text-foreground">{m.assignedScout}</span>
                </div>
              )}
              {claimedByMe && (
                <Badge variant="secondary">Being worked on by you</Badge>
              )}
              {claimedByOther && (
                <Badge variant="outline" className="text-muted-foreground">
                  Being worked on by {claimForSlot.scoutName}
                </Badge>
              )}
              {!claimForSlot && (
                <Button size="sm" onClick={() => handleClaim(m)}>
                  Scout this
                </Button>
              )}
            </CardContent>
          </Card>
        )
      })}
```

- [ ] **Step 8: Add floating assign bar + dialog**

Add after the map block and before `</div>` closing the container:

```tsx
      {isTechLead && selectedSlots.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
          <Button onClick={() => setAssignDialogOpen(true)} size="lg" className="shadow-lg">
            Assign {selectedSlots.size} match{selectedSlots.size === 1 ? "" : "es"}
          </Button>
        </div>
      )}

      <Dialog open={assignDialogOpen} onOpenChange={setAssignDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign {selectedSlots.size} match{selectedSlots.size === 1 ? "" : "es"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Assign to</Label>
              <Select value={assigneeEmail} onValueChange={setAssigneeEmail}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a rescouter" />
                </SelectTrigger>
                <SelectContent>
                  {rescouterOptions.map((o) => (
                    <SelectItem key={o.email} value={o.email}>
                      {o.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g. Camera angle issue on match 12"
                value={assignNote}
                onChange={(e) => setAssignNote(e.target.value)}
                maxLength={500}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAssign} disabled={!assigneeEmail || assigning}>
              {assigning ? "Assigning…" : "Assign & Notify"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
```

- [ ] **Step 9: Build and verify**

```bash
npm run build
```

Expected: no TypeScript errors. If errors appear about missing shadcn components, check `src/components/ui/` for the exact export names.

Manual verification checklist:
1. As tech lead: checkboxes appear on each missing match card
2. Select 2+ matches → floating "Assign X matches" button appears at bottom
3. Click it → dialog opens with scout picker (only rescout-enabled users)
4. Select a scout, optionally add note, click "Assign & Notify" → toast success, cards update to show "Rescout: [name]" + "Originally: [originalScout]"
5. Tech lead sees × button on assigned cards → click removes assignment
6. As non-tech-lead user: no checkboxes, no assign button, assignment badge still visible on cards

- [ ] **Step 10: Commit**

```bash
git add src/pages/RescouterPage.tsx
git commit -m "feat: tech lead rescout assignment UI with push notification"
```

---

## Task 5: Rebuild Docker + Final Verification

- [ ] **Step 1: Rebuild backend**

```bash
docker compose up --build -d
```

- [ ] **Step 2: End-to-end smoke test**

1. Load app in browser
2. Navigate to `/rescout` as tech lead
3. Assign a match to a rescouter who has push subscriptions → verify toast + card updates
4. Navigate to rescout page as the assignee → confirm assignment badge visible
5. Click "Scout this" on any match → confirm game-start pre-selects correct alliance + position

- [ ] **Step 3: Final commit if any fixups needed**

```bash
git add -A
git commit -m "fix: rescout assignment post-review fixups"
```

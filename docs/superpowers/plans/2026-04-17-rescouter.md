# Rescouter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a rescouter permission flag + page for claiming/scouting missing matches, an inline role dropdown in User Management, and a beforeunload guard on all scouting pages after game-start.

**Architecture:** `rescouter` is a toggleable boolean permission stored in a new `RescouterPermission` Prisma model; claims use a `RescoutClaim` model with heartbeat expiry. The missing-match logic is extracted from `DataManagementPage` into a shared util so both pages can use it. The beforeunload guard is a single custom hook applied to each relevant page.

**Tech Stack:** React 19 + TypeScript, Express.js, Prisma ORM (MySQL), Tailwind CSS + shadcn/ui, React Router v6

---

## File Map

**Create:**
- `server/src/routes/rescout.js` — claims CRUD + rescouter permission CRUD
- `src/pages/RescouterPage.tsx` — missing matches list + claim + navigate to scouting
- `src/hooks/useUnsavedChangesGuard.ts` — beforeunload listener hook
- `src/lib/missingMatchUtils.ts` — extracted missing-match logic (shared with DataManagementPage)

**Modify:**
- `server/prisma/schema.prisma` — add `RescoutClaim` + `RescouterPermission` models
- `server/src/index.js` — register `/rescout` route
- `src/contexts/AuthContext.tsx` — add `canRescout`, `rescouterPermissions: Record<string,boolean>`, `setRescouter(email, enabled)`
- `src/lib/tbaUtils.ts` — add `videos?` field to `TBAMatch` interface
- `src/App.tsx` — add `/rescout` route
- `src/pages/UserManagementPage.tsx` — inline role select + rescouter checkbox per user row
- `src/components/DashboardComponents/app-sidebar.tsx` — add Rescout sidebar link
- `src/pages/AutoStartPage.tsx` — add `useUnsavedChangesGuard`
- `src/pages/ScoringPage.tsx` — add `useUnsavedChangesGuard` to both exported components
- `src/pages/EndgamePage.tsx` — add `useUnsavedChangesGuard`
- `src/pages/ScoutFormPage.tsx` — add `useUnsavedChangesGuard`

---

## Task 1: Prisma schema — add two new models

**Files:**
- Modify: `server/prisma/schema.prisma`

- [ ] **Step 1: Add models to schema**

Open `server/prisma/schema.prisma` and append these two models at the end of the file (after the last model):

```prisma
model RescouterPermission {
  email     String  @id @db.VarChar(255)
  enabled   Boolean @default(true)
  updatedAt Int     @map("updated_at")

  @@map("rescouter_permissions")
}

model RescoutClaim {
  id            Int      @id @default(autoincrement())
  matchNumber   String   @map("match_number") @db.VarChar(255)
  alliance      String   @db.VarChar(16)
  position      String   @db.VarChar(16)
  eventKey      String   @map("event_key") @db.VarChar(255)
  scoutEmail    String   @map("scout_email") @db.VarChar(255)
  scoutName     String   @map("scout_name") @db.VarChar(255)
  claimedAt     DateTime @default(now()) @map("claimed_at")
  lastHeartbeat DateTime @default(now()) @map("last_heartbeat")

  @@index([eventKey, matchNumber, position], map: "idx_rescout_slot")
  @@index([lastHeartbeat], map: "idx_rescout_heartbeat")
  @@map("rescout_claims")
}
```

- [ ] **Step 2: Run migration**

```bash
cd server && npx prisma db push
```

Expected: `Your database is now in sync with your Prisma schema.`

- [ ] **Step 3: Commit**

```bash
git add server/prisma/schema.prisma
git commit -m "feat: add RescoutClaim and RescouterPermission prisma models"
```

---

## Task 2: Backend — rescout routes

**Files:**
- Create: `server/src/routes/rescout.js`
- Modify: `server/src/index.js`

- [ ] **Step 1: Create route file**

Create `server/src/routes/rescout.js`:

```js
const express = require("express")
const { prisma } = require("../db")
const asyncHandler = require("../utils/asyncHandler")
const { nowSeconds } = require("../utils/dbUtils")

const router = express.Router()

const HEARTBEAT_TTL_SECONDS = 60
const TECH_LEAD_ROLES = new Set(["tech_lead"])
const RESCOUTER_DEFAULT_ROLES = new Set(["scout_plus", "lead", "tech_lead"])

const getActiveClaimsWhere = () => ({
  lastHeartbeat: {
    gte: new Date(Date.now() - HEARTBEAT_TTL_SECONDS * 1000),
  },
})

const requireTechLead = async (req, res) => {
  const email = req.user?.email
  if (!email) { res.status(401).json({ error: "Not authenticated" }); return false }
  const row = await prisma.role.findUnique({
    where: { email: String(email).trim().toLowerCase() },
    select: { role: true },
  })
  if (!row || !TECH_LEAD_ROLES.has(row.role)) {
    res.status(403).json({ error: "Forbidden" }); return false
  }
  return true
}

// GET /rescout/claims — all active claims
router.get(
  "/claims",
  asyncHandler(async (_req, res) => {
    const claims = await prisma.rescoutClaim.findMany({
      where: getActiveClaimsWhere(),
    })
    res.json({ claims })
  })
)

// POST /rescout/claims — create claim; 409 if slot already active
router.post(
  "/claims",
  asyncHandler(async (req, res) => {
    const { matchNumber, alliance, position, eventKey, scoutName } = req.body
    const scoutEmail = req.user?.email
    if (!matchNumber || !alliance || !position || !eventKey || !scoutName || !scoutEmail) {
      return res.status(400).json({ error: "Missing required fields" })
    }

    const existing = await prisma.rescoutClaim.findFirst({
      where: {
        matchNumber: String(matchNumber),
        alliance: String(alliance),
        position: String(position),
        eventKey: String(eventKey),
        ...getActiveClaimsWhere(),
      },
    })

    if (existing) {
      return res.status(409).json({ error: "Slot already claimed", claim: existing })
    }

    // Delete any stale claims for same slot before creating new one
    await prisma.rescoutClaim.deleteMany({
      where: {
        matchNumber: String(matchNumber),
        alliance: String(alliance),
        position: String(position),
        eventKey: String(eventKey),
      },
    })

    const claim = await prisma.rescoutClaim.create({
      data: {
        matchNumber: String(matchNumber),
        alliance: String(alliance),
        position: String(position),
        eventKey: String(eventKey),
        scoutEmail: String(scoutEmail).trim().toLowerCase(),
        scoutName: String(scoutName),
      },
    })
    res.status(201).json({ claim })
  })
)

// PATCH /rescout/claims/:id/heartbeat — bump lastHeartbeat
router.patch(
  "/claims/:id/heartbeat",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" })

    const claim = await prisma.rescoutClaim.update({
      where: { id },
      data: { lastHeartbeat: new Date() },
    })
    res.json({ claim })
  })
)

// DELETE /rescout/claims/:id — release claim
router.delete(
  "/claims/:id",
  asyncHandler(async (req, res) => {
    const id = parseInt(req.params.id, 10)
    if (!Number.isFinite(id)) return res.status(400).json({ error: "Invalid id" })

    await prisma.rescoutClaim.delete({ where: { id } }).catch(() => null)
    res.status(204).end()
  })
)

// GET /rescout/permissions — returns all explicit rescouter permission overrides
router.get(
  "/permissions",
  asyncHandler(async (_req, res) => {
    const rows = await prisma.rescouterPermission.findMany()
    const permissions = rows.reduce((acc, row) => {
      acc[row.email] = row.enabled
      return acc
    }, {})
    res.json({ permissions })
  })
)

// PUT /rescout/permissions/:email — set rescouter permission (tech_lead only)
router.put(
  "/permissions/:email",
  asyncHandler(async (req, res) => {
    if (!(await requireTechLead(req, res))) return

    const email = String(req.params.email).trim().toLowerCase()
    const { enabled } = req.body
    if (typeof enabled !== "boolean") {
      return res.status(400).json({ error: "enabled must be boolean" })
    }

    const row = await prisma.rescouterPermission.upsert({
      where: { email },
      update: { enabled, updatedAt: nowSeconds() },
      create: { email, enabled, updatedAt: nowSeconds() },
    })
    res.json({ permission: row })
  })
)

module.exports = router
```

- [ ] **Step 2: Register route in server/src/index.js**

In `server/src/index.js`, add after the last `require` for routes (around line 22):

```js
const rescoutRouter = require("./routes/rescout")
```

Then in the `registerRoutes` function, add after the last `app.use` call (around line 203):

```js
  app.use(resolvePath("/rescout"), apiAuthMiddleware, rescoutRouter)
```

- [ ] **Step 3: Test endpoints manually**

Start server: `cd server && npm run dev`

```bash
# Should return { claims: [] }
curl -s http://localhost:4000/api/rescout/claims -H "Authorization: Bearer <token>"
# Should return { permissions: {} }
curl -s http://localhost:4000/api/rescout/permissions -H "Authorization: Bearer <token>"
```

- [ ] **Step 4: Commit**

```bash
git add server/src/routes/rescout.js server/src/index.js
git commit -m "feat: add rescout claims and permissions API routes"
```

---

## Task 3: Add `videos` field to TBAMatch interface

**Files:**
- Modify: `src/lib/tbaUtils.ts`

- [ ] **Step 1: Extend TBAMatch**

In `src/lib/tbaUtils.ts`, the `TBAMatch` interface ends with `post_result_time: number;` at line 91. Add the `videos` field before the closing `}`:

```ts
  videos?: Array<{ type: string; key: string }>;
```

So the end of `TBAMatch` becomes:

```ts
  post_result_time: number;
  videos?: Array<{ type: string; key: string }>;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/tbaUtils.ts
git commit -m "feat: add videos field to TBAMatch interface"
```

---

## Task 4: Extract missing match logic to shared util

**Files:**
- Create: `src/lib/missingMatchUtils.ts`

- [ ] **Step 1: Create the util**

Create `src/lib/missingMatchUtils.ts`:

```ts
import { fetchRemoteSchedule } from "@/lib/scheduleApi"
import { fetchQualificationSchedule, resolveTbaApiKey } from "@/lib/tbaUtils"
import type { ParsedMatch } from "@/types/schedule"

export interface MissingMatch {
  matchNumber: string
  matchNumNormalized: string
  position: string
  alliance: "Red" | "Blue"
  slotIndex: number
  teamNumber: string
  assignedScout: string
  assignedScoutEmail: string
  eventKey: string
}

const normalizeMatchNum = (v: string) => v.replace(/\D/g, "")

export interface FindMissingMatchesOptions {
  eventKey?: string
  existingKeys: Set<string> // `${matchNumNorm}::${teamNumber}`
  latestMatchNum: number
}

export async function findMissingMatches(opts: FindMissingMatchesOptions): Promise<{
  missing: MissingMatch[]
  usedTba: boolean
  eventKey: string
}> {
  const { existingKeys, latestMatchNum } = opts

  const schedule = await fetchRemoteSchedule(opts.eventKey || undefined)
  if (!schedule || !schedule.assignments.length) {
    throw new Error("No schedule found — publish a schedule first")
  }

  const aliases = schedule.aliases ?? {}
  const effectiveEventKey = (opts.eventKey ?? "").trim() || schedule.eventKey || ""

  type MatchTeamData = { red: string[]; blue: string[] }
  const matchTeamMap = new Map<string, MatchTeamData>()
  let usedTba = false

  if (effectiveEventKey && resolveTbaApiKey()) {
    try {
      const tbaSchedule = await fetchQualificationSchedule(effectiveEventKey)
      for (const m of tbaSchedule) {
        matchTeamMap.set(String(m.matchNum), { red: m.redAlliance, blue: m.blueAlliance })
      }
      usedTba = tbaSchedule.length > 0
    } catch {
      // fall through to schedule fallback
    }
  }

  if (!usedTba) {
    const fallbackMap = new Map<string, ParsedMatch>()
    for (const m of schedule.matches) {
      fallbackMap.set(normalizeMatchNum(m.matchNumber), m)
    }
    for (const [k, m] of fallbackMap) {
      matchTeamMap.set(k, { red: m.red, blue: m.blue })
    }
  }

  const missing: MissingMatch[] = []

  for (const assignment of schedule.assignments) {
    const matchNorm = normalizeMatchNum(assignment.matchNumber)
    if (latestMatchNum > 0 && parseInt(matchNorm, 10) > latestMatchNum) continue
    const teamData = matchTeamMap.get(matchNorm)

    for (const pos of ["red-1", "red-2", "red-3", "blue-1", "blue-2", "blue-3"] as const) {
      const scoutEmail = assignment.positions[pos]
      if (!scoutEmail || scoutEmail === "Unassigned") continue

      const [allianceStr, slotStr] = pos.split("-")
      const slotIndex = parseInt(slotStr, 10) - 1

      const teamNumber = teamData
        ? (allianceStr === "red" ? teamData.red[slotIndex] : teamData.blue[slotIndex]) ?? ""
        : ""

      if (!teamNumber) continue

      if (!existingKeys.has(`${matchNorm}::${teamNumber}`)) {
        missing.push({
          matchNumber: assignment.matchNumber,
          matchNumNormalized: matchNorm,
          position: pos,
          alliance: allianceStr === "red" ? "Red" : "Blue",
          slotIndex: slotIndex + 1,
          teamNumber,
          assignedScout: aliases[scoutEmail] ?? scoutEmail,
          assignedScoutEmail: scoutEmail,
          eventKey: effectiveEventKey,
        })
      }
    }
  }

  missing.sort((a, b) => {
    const mDiff = parseInt(a.matchNumNormalized, 10) - parseInt(b.matchNumNormalized, 10)
    return mDiff !== 0 ? mDiff : a.position.localeCompare(b.position)
  })

  return { missing, usedTba, eventKey: effectiveEventKey }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/missingMatchUtils.ts
git commit -m "feat: extract missing match logic into shared util"
```

---

## Task 5: AuthContext — canRescout + rescouterPermissions + setRescouter

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Add types to AuthContextValue**

In `AuthContext.tsx`, the `AuthContextValue` type starts around line 49. Add these three fields to it:

```ts
  canRescout: boolean
  rescouterPermissions: Record<string, boolean>
  setRescouter: (email: string, enabled: boolean) => Promise<void>
```

- [ ] **Step 2: Add state and fetch logic**

After the `const VALID_ROLES` line (around line 133), add:

```ts
const RESCOUTER_DEFAULT_ROLES: UserRole[] = ['scout_plus', 'lead', 'tech_lead']
```

Inside the `AuthProvider` component body, after the `roleAssignments` state (it's defined somewhere around line 200+), add:

```ts
const [rescouterPermissions, setRescouterPermissions] = useState<Record<string, boolean>>({})

const fetchRescouterPermissions = useCallback(async () => {
  if (!hasUsableAuthToken()) return
  try {
    const data = await apiGet<{ permissions: Record<string, boolean> }>('/rescout/permissions')
    setRescouterPermissions(data.permissions ?? {})
  } catch {
    // non-critical, leave empty
  }
}, [])
```

- [ ] **Step 3: Fetch permissions on auth ready**

Find the `useEffect` that calls `fetchRoleAssignmentsFromApi` on mount (it checks `hasUsableAuthToken()`). In that same effect (or right after it), add a call to `fetchRescouterPermissions()`.

Look for the effect that has something like:
```ts
void fetchRoleAssignmentsFromApi()
```
And add after it:
```ts
void fetchRescouterPermissions()
```

- [ ] **Step 4: Compute canRescout**

After the `const isLead = ...` line (around line 1447), add:

```ts
const canRescout = useMemo<boolean>(() => {
  if (!user) return false
  const normalized = normalizeEmail(user.email)
  if (normalized in rescouterPermissions) return rescouterPermissions[normalized]
  return RESCOUTER_DEFAULT_ROLES.includes(role)
}, [user, role, rescouterPermissions])
```

- [ ] **Step 5: Add setRescouter function**

After `canRescout`, add:

```ts
const setRescouter = useCallback(async (email: string, enabled: boolean) => {
  const normalized = normalizeEmail(email)
  await apiPut(`/rescout/permissions/${encodeURIComponent(normalized)}`, { enabled })
  setRescouterPermissions(prev => ({ ...prev, [normalized]: enabled }))
}, [])
```

Note: `apiPut` is already imported at the top of AuthContext from `@/lib/apiClient`.

- [ ] **Step 6: Add to context value**

In the `value = useMemo<AuthContextValue>(...)` object (around line 1526), add:

```ts
    canRescout,
    rescouterPermissions,
    setRescouter,
```

And add the same three to the deps array of that `useMemo`.

- [ ] **Step 7: Lint check**

```bash
cd /srv/md0/robotics/maneuver-qe && npm run lint -- --max-warnings=999 2>&1 | grep -E "AuthContext|error" | head -30
```

Expected: no new errors in AuthContext.tsx

- [ ] **Step 8: Commit**

```bash
git add src/contexts/AuthContext.tsx
git commit -m "feat: add canRescout, rescouterPermissions, setRescouter to AuthContext"
```

---

## Task 6: beforeunload guard hook

**Files:**
- Create: `src/hooks/useUnsavedChangesGuard.ts`

- [ ] **Step 1: Create hook**

Create `src/hooks/useUnsavedChangesGuard.ts`:

```ts
import { useEffect } from 'react'

export function useUnsavedChangesGuard(active: boolean) {
  useEffect(() => {
    if (!active) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }

    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}
```

- [ ] **Step 2: Apply to AutoStartPage**

In `src/pages/AutoStartPage.tsx`, add the import at the top:

```ts
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
```

Inside the `AutoStartPage` component body (after the state declarations), add:

```ts
useUnsavedChangesGuard(true)
```

- [ ] **Step 3: Apply to ScoringPage**

In `src/pages/ScoringPage.tsx`, add the import:

```ts
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
```

Inside **both** `AutoScoringPage` and `TeleopScoringPage` component bodies, add:

```ts
useUnsavedChangesGuard(true)
```

- [ ] **Step 4: Apply to EndgamePage**

In `src/pages/EndgamePage.tsx`, add the import:

```ts
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
```

Inside `EndgamePage` component body, add:

```ts
useUnsavedChangesGuard(true)
```

- [ ] **Step 5: Apply to ScoutFormPage**

In `src/pages/ScoutFormPage.tsx`, add the import:

```ts
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard'
```

Inside `ScoutFormPage` component body, add:

```ts
useUnsavedChangesGuard(true)
```

- [ ] **Step 6: Lint check**

```bash
npm run lint -- --max-warnings=999 2>&1 | grep -E "error|ScoringPage|EndgamePage|AutoStartPage|ScoutFormPage" | head -20
```

Expected: no new errors.

- [ ] **Step 7: Commit**

```bash
git add src/hooks/useUnsavedChangesGuard.ts src/pages/AutoStartPage.tsx src/pages/ScoringPage.tsx src/pages/EndgamePage.tsx src/pages/ScoutFormPage.tsx
git commit -m "feat: add beforeunload guard to scouting pages (not game-start)"
```

---

## Task 7: RescouterPage

**Files:**
- Create: `src/pages/RescouterPage.tsx`

- [ ] **Step 1: Create the page**

Create `src/pages/RescouterPage.tsx`:

```tsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { useAuth } from "@/contexts/AuthContext"
import { apiDelete, apiGet, apiPatch, apiPost } from "@/lib/apiClient"
import { loadAllScoutingEntries } from "@/lib/dexieDB"
import { findMissingMatches, type MissingMatch } from "@/lib/missingMatchUtils"
import { getMatch } from "@/lib/tbaUtils"
import { STORAGE_EVENT_NAME_KEY } from "@/lib/eventSettingsClient"
import { resolveTbaApiKey } from "@/lib/tbaUtils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { Youtube, RefreshCw, ClipboardCheck } from "lucide-react"

interface ActiveClaim {
  id: number
  matchNumber: string
  alliance: string
  position: string
  eventKey: string
  scoutEmail: string
  scoutName: string
}

const HEARTBEAT_MS = 30_000

export default function RescouterPage() {
  const { user, role, canRescout } = useAuth()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(false)
  const [missing, setMissing] = useState<MissingMatch[]>([])
  const [claims, setClaims] = useState<ActiveClaim[]>([])
  const [videoKeys, setVideoKeys] = useState<Record<string, string>>({})
  const [myClaimId, setMyClaimId] = useState<number | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const eventKey = useMemo(() => localStorage.getItem(STORAGE_EVENT_NAME_KEY) ?? "", [])

  const fetchClaims = useCallback(async () => {
    try {
      const data = await apiGet<{ claims: ActiveClaim[] }>("/rescout/claims")
      setClaims(data.claims ?? [])
    } catch {
      // non-critical
    }
  }, [])

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

      // Fetch YouTube video keys for each unique match number
      if (eventKey && resolveTbaApiKey()) {
        const uniqueMatchNums = [...new Set(found.map((m) => m.matchNumNormalized))]
        const keys: Record<string, string> = {}
        await Promise.allSettled(
          uniqueMatchNums.map(async (num) => {
            try {
              const matchKey = `${eventKey}_qm${num}`
              const match = await getMatch(matchKey)
              const ytVideo = match.videos?.find((v) => v.type === "youtube")
              if (ytVideo) keys[num] = ytVideo.key
            } catch {
              // no video for this match
            }
          })
        )
        setVideoKeys(keys)
      }

      await fetchClaims()
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load missing matches"
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [eventKey, fetchClaims])

  useEffect(() => {
    void loadMissing()
  }, [loadMissing])

  // Poll claims every 15s
  useEffect(() => {
    const id = setInterval(() => void fetchClaims(), 15_000)
    return () => clearInterval(id)
  }, [fetchClaims])

  // Release claim on unmount (best-effort)
  useEffect(() => {
    return () => {
      if (myClaimId !== null) {
        navigator.sendBeacon?.(`/api/rescout/claims/${myClaimId}`)
        void apiDelete(`/rescout/claims/${myClaimId}`).catch(() => null)
        if (heartbeatRef.current) clearInterval(heartbeatRef.current)
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

      // Start heartbeat
      if (heartbeatRef.current) clearInterval(heartbeatRef.current)
      heartbeatRef.current = setInterval(async () => {
        try {
          await apiPatch(`/rescout/claims/${claimId}/heartbeat`, {})
        } catch {
          // if heartbeat fails, don't crash
        }
      }, HEARTBEAT_MS)

      // Navigate to game-start with pre-filled state
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

  if (!canRescout) {
    return (
      <div className="container mx-auto p-4 max-w-2xl">
        <p className="text-muted-foreground">You don't have rescouter access.</p>
      </div>
    )
  }

  const myEmail = user?.email?.trim().toLowerCase() ?? ""

  return (
    <div className="container mx-auto p-4 max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Rescout Missing Matches</h1>
          <p className="text-sm text-muted-foreground">
            {eventKey ? `Event: ${eventKey}` : "No event configured"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadMissing} disabled={loading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {loading && (
        <div className="text-center py-12 text-muted-foreground">Loading missing matches…</div>
      )}

      {!loading && missing.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-2">
            <ClipboardCheck className="h-8 w-8" />
            <p>No missing matches found.</p>
          </CardContent>
        </Card>
      )}

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

        return (
          <Card key={`${m.matchNumNormalized}-${m.position}`}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">
                  Match {m.matchNumNormalized} — {m.position.toUpperCase()}
                </CardTitle>
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
              <div className="text-sm text-muted-foreground">
                Team <span className="font-medium text-foreground">{m.teamNumber}</span>
                {" · "}Assigned to <span className="font-medium text-foreground">{m.assignedScout}</span>
              </div>
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
    </div>
  )
}
```

- [ ] **Step 2: Lint check**

```bash
npm run lint -- --max-warnings=999 2>&1 | grep -E "RescouterPage|error" | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pages/RescouterPage.tsx
git commit -m "feat: add RescouterPage with missing match list, claims, and YouTube links"
```

---

## Task 8: Register /rescout route in App.tsx + sidebar link

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/components/DashboardComponents/app-sidebar.tsx`

- [ ] **Step 1: Add import and route to App.tsx**

In `src/App.tsx`, add import after the existing page imports (around line 54):

```tsx
import RescouterPage from "@/pages/RescouterPage"
```

Inside the router `createRoutesFromElements`, add after the `/schedule` route:

```tsx
        <Route path="/rescout" element={<RescouterPage />} />
```

- [ ] **Step 2: Add routePermissions entry in AuthContext**

In `src/contexts/AuthContext.tsx`, in the `routePermissions` array (around line 303), add:

```ts
  { pattern: /^\/rescout$/, minRole: 'scout_plus' },
```

- [ ] **Step 3: Add sidebar link**

In `src/components/DashboardComponents/app-sidebar.tsx`, the file uses `useAuth` indirectly via the `NavMain` component. The sidebar data is defined as a `const data` object. Look at how items are filtered by `minRole`.

First, add the import at the top if `RotateCcw` or a similar icon is needed. Add the import:

```tsx
import { ClipboardList, Settings, Users2, UserCog, Activity, RotateCcw } from "lucide-react"
```

Then in the `data.navMain` array, find the section that would logically contain this (before "Scouting Ops" or as a standalone item). Add a new top-level entry:

```ts
    {
      title: "Rescout",
      url: "/rescout",
      icon: RotateCcw,
      minRole: "scout_plus" as UserRole,
      items: [],
    },
```

**Note:** Check how `NavMain` renders items with empty `items` arrays vs items with children. If empty `items` causes issues (no dropdown, renders as direct link), that's the correct behavior for a flat link. Check `src/components/DashboardComponents/nav-main.tsx` to confirm.

- [ ] **Step 4: Lint check**

```bash
npm run lint -- --max-warnings=999 2>&1 | grep -E "App\.tsx|app-sidebar|error" | head -20
```

- [ ] **Step 5: Commit**

```bash
git add src/App.tsx src/contexts/AuthContext.tsx src/components/DashboardComponents/app-sidebar.tsx
git commit -m "feat: register /rescout route and add sidebar link"
```

---

## Task 9: Inline role dropdown + rescouter checkbox in UserManagementPage

**Files:**
- Modify: `src/pages/UserManagementPage.tsx`

The current user row (lines ~663–734) shows the role as a colored `Badge` and opens a detail modal on click. We need to add an inline `Select` for role and a `Checkbox` for rescouter, and remove the role select from the modal.

- [ ] **Step 1: Add imports**

In `src/pages/UserManagementPage.tsx`, add `Checkbox` to the existing import:

```tsx
import { Checkbox } from "@/components/ui/checkbox"
```

Update the `useAuth` import to also get `setRescouter`, `rescouterPermissions`, `isUltraAdmin`:

```tsx
const { user: currentUser, setRole, setRescouter, rescouterPermissions, isUltraAdmin } = useAuth()
```

- [ ] **Step 2: Add handleRoleChange if not present**

Check if `handleRoleChange` already exists (it should be called from the modal Select). If it does, reuse it. It should look like:

```tsx
const handleRoleChange = async (targetUser: User, newRole: string) => {
  try {
    await setRole(targetUser.email, newRole as import("@/contexts/AuthContext").UserRole)
    setUsers(prev => prev.map(u => u.email === targetUser.email ? { ...u, role: newRole } : u))
    toast.success(`Updated ${targetUser.displayName || targetUser.email} to ${ROLE_LABELS[newRole] ?? newRole}`)
  } catch {
    toast.error("Failed to update role")
  }
}
```

- [ ] **Step 3: Add handleRescouterToggle**

After `handleRoleChange`, add:

```tsx
const handleRescouterToggle = async (targetUser: User, enabled: boolean) => {
  try {
    await setRescouter(targetUser.email, enabled)
    toast.success(`Rescouter ${enabled ? "enabled" : "disabled"} for ${targetUser.displayName || targetUser.email}`)
  } catch {
    toast.error("Failed to update rescouter permission")
  }
}
```

- [ ] **Step 4: Add inline controls to the user row**

Find the user row JSX (around line 663). Currently it has a role Badge and a delete Button. Between the role Badge and the delete Button, add:

```tsx
{!user.isEntryOnly && isUltraAdmin && (
  <div className="flex items-center gap-2 ml-2" onClick={(e) => e.stopPropagation()}>
    <Select
      value={user.role}
      onValueChange={(newRole) => handleRoleChange(user, newRole)}
    >
      <SelectTrigger className="w-32 h-7 text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ASSIGNABLE_ROLES.map((r) => (
          <SelectItem key={r} value={r} className="text-xs">
            {ROLE_LABELS[r] ?? r}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <div className="flex items-center gap-1" title="Rescouter access">
      <Checkbox
        id={`rescout-${user.email}`}
        checked={
          user.email.toLowerCase() in rescouterPermissions
            ? rescouterPermissions[user.email.toLowerCase()]
            : ["scout_plus", "lead", "tech_lead"].includes(user.role)
        }
        onCheckedChange={(checked) => handleRescouterToggle(user, !!checked)}
        className="h-3 w-3"
      />
      <label htmlFor={`rescout-${user.email}`} className="text-xs text-muted-foreground cursor-pointer">
        Rescout
      </label>
    </div>
  </div>
)}
```

- [ ] **Step 5: Remove role select from detail modal**

In the modal section (around line 786–810), the role `Select` is rendered inside the detail dialog. Remove it and replace with just a static Badge, since role changes now happen inline:

Find this block in the modal:
```tsx
                    ) : (
                      <div className="mt-1">
                        <Select
                          value={selectedUser.role}
                          onValueChange={(newRole) => handleRoleChange(selectedUser, newRole)}
                        >
                          <SelectTrigger className="w-40 h-8 text-sm">
                            <SelectValue />
```
Replace the entire `Select` block in the modal with:
```tsx
                    ) : (
                      <div className="mt-1">
                        <Badge className={`${roleColors[selectedUser.role] ?? "bg-gray-500"} text-white`}>
                          {ROLE_LABELS[selectedUser.role] ?? selectedUser.role}
                        </Badge>
```

- [ ] **Step 6: Lint check**

```bash
npm run lint -- --max-warnings=999 2>&1 | grep -E "UserManagementPage|error" | head -20
```

- [ ] **Step 7: Commit**

```bash
git add src/pages/UserManagementPage.tsx
git commit -m "feat: add inline role dropdown and rescouter checkbox to user management"
```

---

## Task 10: Final lint + self-review

- [ ] **Step 1: Full lint run**

```bash
cd /srv/md0/robotics/maneuver-qe && npm run lint 2>&1 | tail -20
```

Expected: 0 errors (warnings OK).

- [ ] **Step 2: TypeScript check**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Fix any type errors before proceeding.

- [ ] **Step 3: Verify all routes are registered**

Check `src/App.tsx` contains `/rescout` route.
Check `src/contexts/AuthContext.tsx` `routePermissions` contains `/rescout`.
Check `server/src/index.js` registers `/rescout`.
Check `server/prisma/schema.prisma` has both `RescoutClaim` and `RescouterPermission`.

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p  # stage only needed files
git commit -m "fix: address lint/type errors from rescouter feature"
```

# Rescout Assignment Feature + Game-Start Team Selection Fix

**Date:** 2026-04-17

---

## Overview

Two related improvements:

1. **Rescout assignment** — tech leads can select a batch of missing match slots on the Rescout page, assign them to a specific rescouter, and that user receives a push notification. Assignments are persisted and shown on match cards.
2. **Game-start team selection fix** — when navigating to game-start from the rescout flow, the correct team position is not pre-selected. Two state fields are passed but not consumed.

---

## Feature 1: Rescout Assignment

### Data Layer

New Prisma model in main DB (same DB as `RescoutClaim`, `RescouterPermission`):

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
  @@index([eventKey, assigneeEmail])
  @@map("rescout_assignments")
}
```

- One row per match slot. Unique on `(eventKey, matchNumber, position)` — reassigning upserts.
- No TTL. Persists until explicitly deleted by a tech lead.

### Backend

All routes added to `server/src/routes/rescout.js`.

**`POST /rescout/assignments`** (tech lead only)
- Body: `{ eventKey, matches: [{ matchNumber, alliance, position, originalScout }], assigneeEmail, assigneeName, note? }`
- Upserts one `RescoutAssignment` row per match slot.
- After all upserts, sends a single push notification to `assigneeEmail` via `sendManualNotification` listing all assigned match numbers.
- Returns: `{ assignments: [...], notified: boolean }`

**`GET /rescout/assignments?eventKey=X`**
- Returns all assignments for the given event key.
- No auth restriction — all authenticated users can read.

**`DELETE /rescout/assignments/:id`** (tech lead only)
- Deletes assignment by id.
- Returns 204.

Scout picker source: frontend calls existing `GET /rescout/permissions`, filters `enabled: true`, uses emails as picker options. Display names fetched from `GET /users/recent` (already exists via `AuthContext` role management) and merged client-side.

### Frontend (`src/pages/RescouterPage.tsx`)

**Tech lead controls (hidden from non-leads):**
- Checkbox on each missing match card for multi-select.
- Floating bottom bar: "Assign X selected" button, visible when ≥1 match is checked.
- Clicking "Assign" opens a Dialog with:
  - Scout picker: dropdown of rescout-enabled users (email + display name if available)
  - Optional note field (plain text, max 500 chars)
  - Confirm button → calls `POST /rescout/assignments`, shows toast, clears selection

**Match card updates (all users):**
- "Rescout assigned to: [assigneeName]" replaces the original scout label as primary attribution.
- "Originally assigned: [assignedScout]" shown below in muted text.
- Tech lead sees an unassign (×) button on assigned cards → calls `DELETE /rescout/assignments/:id`.

**Data fetching:**
- `GET /rescout/assignments?eventKey=X` called on load (alongside existing `fetchClaims`).
- Merged with `missing` list by `(matchNumber, position)` key to determine card display state.

### Notification payload

Single notification, not one per match:

```
Title: "You've been assigned rescout matches"
Body:  "Matches [N1, N2, N3] at [eventKey] — tap to view. [note if provided]"
URL:   "/rescout"
Tag:   rescout-assignment-[eventKey]-[assigneeEmail]-[timestamp]
```

---

## Feature 2: Game-Start Team Selection Fix

**File:** `src/pages/GameStartPage.tsx`

**Root cause:** `RescouterPage` navigates to `/game-start` with state:
```js
{ inputs: { matchNumber, alliance, teamPosition: match.slotIndex, teamNumber: match.teamNumber } }
```

But `GameStartPage` initializes:
```js
const [selectTeam, setSelectTeam] = useState(states?.inputs?.selectTeam || "")
// never reads states.inputs.teamNumber

preferredTeamPosition={
  currentAssignment?.slotIndex != null
    ? currentAssignment.slotIndex + 1
    : stationInfo.teamPosition  // ← never reads states.inputs.teamPosition
}
```

**Fix (two lines):**

1. Seed `selectTeam` from `teamNumber` if `selectTeam` absent:
   ```js
   const [selectTeam, setSelectTeam] = useState(
     states?.inputs?.selectTeam || states?.inputs?.teamNumber || ""
   )
   ```

2. Use `states.inputs.teamPosition` (slotIndex, 0-based) as fallback for `preferredTeamPosition`:
   ```js
   preferredTeamPosition={
     currentAssignment?.slotIndex != null
       ? currentAssignment.slotIndex + 1
       : states?.inputs?.teamPosition != null
         ? Number(states.inputs.teamPosition) + 1
         : stationInfo.teamPosition
   }
   ```

`slotIndex` is 0-based (`red-1 → 0`, `red-2 → 1`, `red-3 → 2`); `preferredTeamPosition` is 1-based; hence `+1`.

---

## Build Sequence

1. Add `RescoutAssignment` model to `server/prisma/schema.prisma`
2. Run `npx prisma db push` (or migrate) inside Docker/server
3. Add backend routes to `server/src/routes/rescout.js`
4. Apply game-start fix in `src/pages/GameStartPage.tsx`
5. Update `src/pages/RescouterPage.tsx` with assignment UI

## Out of Scope

- Notification to original scout that their match was re-assigned (future)
- Bulk unassign
- Assignment history / audit log

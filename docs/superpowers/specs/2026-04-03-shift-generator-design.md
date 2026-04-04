# Shift Generator — Design Spec
**Date:** 2026-04-03

## Overview

Replace the existing Schedule Automation page with a new Shift Generator page. The Shift Generator lets a scout lead check in attending scouts, assign load preferences, and auto-generate a position-locked, gap-enforced scouting rotation. It also watches TBA for schedule release and notifies all scouts via push when quals drop.

## What Gets Deleted

- `src/pages/ScheduleAutomationPage.tsx` — removed entirely
- Route `/schedule-automation` and its sidebar entry — removed
- The naive `buildAssignments` round-robin inside that page — gone

## What Gets Kept / Reused

- `src/types/schedule.ts` — `MatchAssignment`, `ParsedMatch`, `StoredScheduleState`, `PLAYER_POSITIONS`
- `src/lib/scheduleCSVParser.ts` — still used for CSV import on the new page
- `src/lib/scheduleApi.ts` — syncing assignments to the backend
- `server/src/routes/schedule.js` — extended with polling endpoint; not rewritten

---

## New Files

| File | Purpose |
|---|---|
| `src/pages/ShiftGeneratorPage.tsx` | Main page component |
| `src/lib/shiftGenerator.ts` | Pure algorithm — no React, fully unit-testable |
| `src/lib/shiftGenerator.test.ts` | Unit tests for the algorithm |

---

## Page Layout (`/shift-generator`)

Three collapsible panels on one scrollable page. Lead can interact with any panel in any order. Role gate: `lead` and above.

### Panel 1 — Event + TBA Watch

- Event key input (pre-fills from `localStorage` if Schedule Automation key was previously set under `STORAGE_KEY`)
- **"Watch for schedule release" toggle.** When enabled, the backend polls TBA every 60 seconds for qualification matches on that event. The moment quals appear it:
  1. Fires a push notification to every scout (reuses existing push infrastructure)
  2. Marks the event as "schedule released" in the backend
  3. Stops polling
- Status display: *Watching…* / *Schedule released — 72 qualification matches*

### Panel 2 — Attendance + Load

- Scrollable checklist of all non-pending registered scouts from `roleAssignments`
- Each row: checkbox (present?), display name / email
- Load selector per checked scout: **Light** (1 shift) · **Normal** (2 shifts) · **Heavy** (3 shifts)
- Running tally: `N scouts checked in · M total shift-slots · ~K shifts of S matches`
- "Select All" / "Deselect All" convenience buttons

### Panel 3 — Generate + Preview

- Shift size input (default 7, positive integer, max = totalMatches)
- **"Generate Schedule"** button — runs algorithm client-side, instant
- Preview table: transposed format (positions as rows, match-range columns, scout names in cells) — mirrors the Mount Olive CSV format exactly
- Warnings section: lists any back-to-back violations or unfilled positions the algorithm had to compromise on
- **"Publish to Schedule Automation"** — writes generated `MatchAssignment[]` into `localStorage` under `schedule_automation_state`, dispatches `scheduleAutomationUpdated` event so the scout-facing schedule view picks it up
- **"Download CSV"** — exports the same transposed CSV

---

## Algorithm — `src/lib/shiftGenerator.ts`

### Types

```ts
export interface ScoutInput {
  email: string
  displayName: string
  targetShifts: 1 | 2 | 3   // load preference
}

export interface ShiftGeneratorInput {
  scouts: ScoutInput[]
  totalMatches: number
  shiftSize: number           // matches per shift block
}

export interface GeneratedSchedule {
  assignments: MatchAssignment[]
  shiftRanges: { label: string; start: number; end: number }[]
  warnings: string[]
  csv: string
}
```

### Steps

**1. Compute shift ranges**
`numShifts = ceil(totalMatches / shiftSize)`
Ranges: `[{start:1, end:7}, {start:8, end:14}, …]` — last range end is clamped to `totalMatches`.

**2. Assign positions to scouts**
- There are 6 positions (`red-1` … `blue-3`). Each position gets a *pool* of 1–3 scouts.
- Total person-shifts needed = `numShifts × 6`.
- Total person-shifts available = `sum(scout.targetShifts)`.
- Distribute scouts to positions greedily: sort scouts by `targetShifts` descending, then assign each scout to the position pool whose current total covered shifts is lowest (targeting even distribution across all 6 positions).
- Each pool is an ordered array; scouts within a pool rotate in order across shifts.

**3. Build per-shift assignments**
For each shift index `i` (0…numShifts-1), for each position:
- Iterate through the position's pool in order.
- Pick the first scout whose last assigned shift index is `< i - 1` (at least one shift gap).
- If no scout satisfies the gap, pick the scout with the *largest* gap (least recently worked) and add a warning.
- Record `lastShiftIndex` per scout.

**4. Validate + warn**
- Warn if any scout is assigned back-to-back shifts (should only happen in severe under-staffing).
- Warn if total available shift-slots < total needed (suggest asking more scouts to go "Heavy").

**5. Build output**
- `assignments`: one `MatchAssignment` per match number (each match in a shift range gets the same scout for that position).
- `shiftRanges`: used to render the preview table headers.
- `csv`: transposed format string — `"Position,Match 1-7,Match 8-14,…\nRed 1,Alex,Jordan,…"`.

---

## TBA Watch — Backend

### New endpoint: `POST /schedule/watch`

**Request body:** `{ eventKey: string }`

**Behavior:**
- Stores `{ eventKey, watching: true }` in memory (replaces any existing watch).
- Starts a 60-second interval polling TBA `/event/{eventKey}/matches/simple` using the existing TBA auth key already present in the server environment (reuse the TBA fetch helper already in `server/src/routes/schedule.js`).
- On first response with qualification matches present:
  1. Fetches all user push subscriptions from the DB.
  2. Sends push notification: title = *"Schedule Released"*, body = *"Qual matches for {eventKey} are now available."*, url = `/shift-generator`.
  3. Sets `watching: false`, clears the interval.
- Returns `{ watching: true, eventKey }`.

### New endpoint: `GET /schedule/watch-status`

Returns `{ watching: boolean, eventKey: string | null, released: boolean }`.

Used by the frontend panel to show current status without re-triggering the watch.

---

## CSV Output Format

Matches the Mount Olive format exactly:

```
,Match 1-7,Match 8-14,Match 15-21
Red 1,Alex,Jordan,Sam
Red 2,Jordan,Sam,Alex
Red 3,Sam,Alex,Jordan
Blue 1,Casey,Riley,Morgan
Blue 2,Riley,Morgan,Casey
Blue 3,Morgan,Casey,Riley
```

First column header is empty. Position labels use title case ("Red 1", not "red-1").

---

## Routing + Sidebar

- New route: `/shift-generator` in `src/App.tsx`, min role `lead`
- Sidebar entry replaces old Schedule Automation entry (same icon position in the nav)
- Old route `/schedule-automation` removed

---

## State Persistence

- Attendance selections and load preferences stored in `localStorage` under `shift_generator_state` — survives page refresh.
- Generated schedule stored in `localStorage` under `schedule_automation_state` (same key as before) so the scout-facing `/schedule` page continues to work without changes.

---

## Constraints Summary

| Constraint | How enforced |
|---|---|
| No scout in two robots same match | Each position has exactly one scout per shift; one scout per position pool slot |
| Position locked for competition | Scout is assigned to one position at distribution time; never reassigned |
| No back-to-back shifts | Gap check: `lastShiftIndex < currentShift - 1` before assigning |
| Lead controls load | `targetShifts` field drives how many pool slots a scout fills |

# Rescouter Feature Design
_2026-04-17_

## Overview

Three loosely coupled additions:
1. `rescouter` permission flag + `/rescout` page for claiming and scouting missing matches
2. Inline role dropdown in User Management (replaces modal)
3. `beforeunload` guard on all scouting pages except `/game-start`

---

## 1. Permission Model

### `rescouter` flag

- **Not** a new `UserRole` in the hierarchy — stored as a separate boolean alongside role assignments
- Backend: new `rescouterPermissions` table (email → enabled boolean), or extend existing role storage
- Frontend: `AuthContext` exposes `canRescout: boolean`
- **Default true** for `scout_plus`, `lead`, `tech_lead`; false for all others
- Tech leads can toggle it per-user via a checkbox inline next to the user's name in User Management

### Route guard

- `/rescout` added to `routePermissions` with `minRole: 'scout_plus'` — but also readable by `lead` / `tech_lead` (already ≥ scout_plus in rank)
- `canRescout` additionally checked inside the page component; if false, redirect to default route

---

## 2. Backend: Claims API

### Prisma model

```prisma
model RescoutClaim {
  id          Int      @id @default(autoincrement())
  matchNumber String
  alliance    String   // "Red" | "Blue"
  position    String   // e.g. "Red 1"
  eventKey    String
  scoutEmail  String
  scoutName   String
  claimedAt   DateTime @default(now())
  lastHeartbeat DateTime @default(now())
}
```

### Routes (`server/src/routes/rescout.js`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/rescout/claims` | All active claims (heartbeat < 60s ago) |
| `POST` | `/api/rescout/claims` | Create claim; 409 if slot already active |
| `PATCH` | `/api/rescout/claims/:id/heartbeat` | Bump `lastHeartbeat` |
| `DELETE` | `/api/rescout/claims/:id` | Release claim (tab close best-effort) |

Active = `lastHeartbeat > NOW() - 60s`. Stale claims are filtered at query time (no background cleanup needed).

---

## 3. Frontend: `/rescout` Page

### Data sources
- Missing matches: reuse `handleFindMissingMatches` logic extracted from `DataManagementPage` into a shared util `src/lib/missingMatchUtils.ts`
- Active claims: `GET /api/rescout/claims` polled on mount + after claim
- TBA videos: add `videos?: Array<{type: string; key: string}>` to `TBAMatch` interface; fetch full match detail for each missing match to get video keys

### UI per slot card
- Match #, alliance badge (red/blue), position, assigned scout name, team number
- YouTube icon link → `https://youtube.com/watch?v={key}` (new tab) — shown only if `videos` contains a youtube entry
- **Unclaimed**: "Scout this" button → claims slot → navigates to `/game-start` with pre-filled state
- **Claimed by self**: "Being worked on…" badge + heartbeat active
- **Claimed by other**: "Being worked on by [scout name]" badge, button disabled

### Claim flow
1. `POST /api/rescout/claims` → get claim `id`
2. Store claim `id` in component state
3. Start `setInterval(heartbeat, 30_000)`
4. Navigate to `/game-start` with `{ matchNumber, alliance, position, teamNumber, rescoutClaimId }` in router state
5. On tab close / component unmount: `DELETE /api/rescout/claims/:id` (best-effort `sendBeacon` or fetch)
6. Heartbeat clears on unmount

### Navigation to scouting
`/game-start` already accepts pre-filled state. No changes needed there — the rescouter page passes the same shape that exists today.

---

## 4. Inline Role Dropdown (User Management)

Current behavior: role change opens a modal.  
New behavior: `Select` dropdown rendered inline next to each user's name row — no modal.

- Same `setRole` call from `AuthContext`
- Remove modal trigger + modal component for role editing
- Checkbox next to dropdown for `rescouter` permission toggle (tech_lead only)

---

## 5. `beforeunload` Guard

Show browser native confirm dialog on unload for these routes:
- `/auto-start`
- `/auto-scoring`
- `/teleop-scoring`
- `/endgame`
- `/scout-form`

**Not** `/game-start` (nothing submitted yet).

Implementation: custom hook `useUnsavedChangesGuard(active: boolean)` in `src/hooks/useUnsavedChangesGuard.ts` — adds/removes `beforeunload` event listener. Each scouting page calls it with `active={true}`.

Message: _"Your scouting data hasn't been submitted yet. If you close now, your changes will be lost."_

Note: browsers override custom messages with a generic prompt — the message text is for React Native / PWA context; the `returnValue` trick still triggers the native dialog in browsers.

---

## 6. Sidebar Link

Add "Rescout" link to `app-sidebar.tsx` visible only when `canRescout` is true.

---

## Files to Create

- `src/pages/RescouterPage.tsx`
- `src/hooks/useUnsavedChangesGuard.ts`
- `src/lib/missingMatchUtils.ts` (extracted from DataManagementPage)
- `server/src/routes/rescout.js`

## Files to Modify

- `server/prisma/schema.prisma` — add `RescoutClaim` model
- `src/contexts/AuthContext.tsx` — add `canRescout`, rescouter permission storage/toggle
- `src/lib/tbaUtils.ts` — add `videos` field to `TBAMatch`
- `src/App.tsx` — add `/rescout` route
- `src/pages/UserManagementPage.tsx` — inline role dropdown + rescouter checkbox
- `src/components/DashboardComponents/app-sidebar.tsx` — add Rescout link
- `src/pages/AutoStartPage.tsx`, `ScoringPage.tsx`, `EndgamePage.tsx`, `ScoutFormPage.tsx` — add `useUnsavedChangesGuard`

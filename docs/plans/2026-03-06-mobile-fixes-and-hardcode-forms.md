# Mobile Fixes, Hardcode Forms & CSV Export Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 5 production issues: slow form loading, missing verification notifications, remove dynamic scouting in favor of hardcoded forms, fix slider touch conflicts on mobile, and fix CSV export for Google Sheets compatibility.

**Architecture:** Each task is independent and can be implemented in any order. The "remove dynamic scouting" task is the largest — it simplifies form loading by eliminating runtime API calls and transformation pipelines, which also fixes issue #1 (slow loading). The slider fix adds `touch-action: manipulation` to prevent gesture conflicts. The CSV fix ensures proper Google Sheets import format matching the example sheet.

**Tech Stack:** React 19 + TypeScript, Vite, Tailwind CSS, Express.js, Prisma ORM

---

## Task 1: Hardcode Match Scouting Form (removes dynamic loading = fixes slow load)

This is the highest-impact task. Currently `DynamicScoutFormPage` makes 2 network calls (`syncActiveFormConfig` + `getForm`) and runs 4 synchronous transformation functions on every load — totaling ~7-10 seconds on mobile. By hardcoding the form (like pit scouting already does), we eliminate all network latency and most CPU overhead.

**Files:**
- Modify: `src/pages/DynamicScoutFormPage.tsx`
- Modify: `src/pages/GameStartPage.tsx`
- Keep: `src/data/hardcodedMatchForm.json` (already exists, already used as fallback)
- Keep: `src/data/hardcodedPitForm.json` (already exists, used by PitScoutingPage)

### Step 1: Hardcode the match form in DynamicScoutFormPage

In `src/pages/DynamicScoutFormPage.tsx`:

**a) Add hardcoded form import at the top (near line 1-20):**

```typescript
import hardcodedMatchFormData from "@/data/hardcodedMatchForm.json"
```

**b) Create pre-computed form constant (after imports, before component):**

Replace the dynamic loading with a pre-computed constant, similar to how `PitScoutingPage.tsx` does it (lines 107-117):

```typescript
const HARDCODED_MATCH_FORM = (() => {
  const raw = hardcodedMatchFormData as unknown as FormDefinition
  const pages = normalizeStratDefenseLabels(
    mergeStratRolesForPages(
      normalizePagesOptionLabels(
        coercePages(raw.schema)
      )
    )
  )
  return {
    ...raw,
    schema: {
      ...raw.schema,
      pages,
    },
  }
})()
```

This runs the transformation pipeline ONCE at module load time (during build/initial page load), not on every form render.

**c) Simplify the component's form loading:**

Remove these useEffect hooks that currently cause the delay:
- Effect #2 (lines ~492-506): `syncActiveFormConfig()` — no longer needed
- Effect #3 (lines ~508-516): `ACTIVE_FORM_UPDATED_EVENT` listener — no longer needed
- Effect #4 (lines ~518-553): `getForm(activeFormId)` — no longer needed

Replace them with a single initialization:

```typescript
// Replace the dynamic form loading state
const [form, setForm] = useState<FormDefinition & { schema: { pages: FormPage[] } }>(HARDCODED_MATCH_FORM)
const [loading, setLoading] = useState(false) // No loading needed — form is instant

// Initialize field values immediately
const [values, setValues] = useState<Record<string, unknown>>(() => {
  const nextValues: Record<string, unknown> = {}
  HARDCODED_MATCH_FORM.schema.pages.forEach((page) => {
    page.sections.forEach((section) => {
      section.fields.forEach((field) => {
        nextValues[field.id] = getInitialValue(field)
      })
    })
  })
  return nextValues
})
```

**d) Remove unused imports:**

Remove imports that were only used for dynamic loading:
- `syncActiveFormConfig`, `getActiveFormId`, `ACTIVE_FORM_UPDATED_EVENT` from `@/lib/activeForm`
- `getForm` from `@/lib/formBuilderApi` (if only used here)

### Step 2: Simplify GameStartPage navigation

In `src/pages/GameStartPage.tsx` (line 319):

The current logic checks `activeFormId` to decide the route:
```typescript
const nextRoute = activeFormId ? "/scout-form" : "/auto-start";
```

Change to always navigate to `/scout-form` since we're hardcoding:
```typescript
const nextRoute = "/scout-form";
```

Also remove the `activeFormId` state and the `useEffect` that calls `syncActiveFormConfig()` + `getActiveFormId("match")` in GameStartPage — search for these references and remove them.

### Step 3: Verify the hardcoded form JSON is correct

Read `src/data/hardcodedMatchForm.json` and confirm it contains the current 2026 match form with all the correct phases (auto, transition, first active, first inactive, second active, second inactive, endgame). If it's outdated, export the current active form from the API (`GET /forms/{activeMatchFormId}`) and save it.

### Step 4: Manual test

- Open the app on mobile
- Navigate to Game Start
- Fill in fields, click "Start Scouting"
- Form should appear instantly (no loading spinner, no "Loading scout form..." message)
- All fields should render correctly
- Submit a test entry and verify data saves to IndexedDB

### Step 5: Commit

```bash
git add src/pages/DynamicScoutFormPage.tsx src/pages/GameStartPage.tsx
git commit -m "perf: hardcode match scouting form to eliminate 10s mobile load time"
```

---

## Task 2: Fix Slider Touch Conflicts on Mobile

The slider (`<input type="range">`) conflicts with two mobile gestures:
1. **Sidebar swipe-to-open**: `SwipeToOpenDetector` listens on a 48px left-edge zone. If a slider is near the left edge, horizontal dragging can trigger the sidebar.
2. **Browser back gesture**: iOS Safari and some Android browsers interpret left-edge swipes as "go back". The SwipeToOpenDetector tries to prevent this but doesn't protect the slider itself.

**Files:**
- Modify: `src/pages/DynamicScoutFormPage.tsx` (slider rendering, ~line 1756-1786)
- Modify: `src/pages/PitScoutingPage.tsx` (slider rendering, ~line 742-758)
- Modify: `src/pages/DriveTeamScoutingPage.tsx` (slider rendering, ~line 743-759)

### Step 1: Add touch-action CSS to all slider inputs

In each of the three files above, find the `<input type="range">` element and add `touch-action: none` plus an `onTouchStart` handler to stop event propagation:

**Before** (current code in all three files):
```tsx
<input
  type="range"
  min={min}
  max={max}
  step={step}
  value={numericValue}
  onChange={(event) => handleValueChange(field.id, event.target.value)}
  className="w-full"
/>
```

**After:**
```tsx
<input
  type="range"
  min={min}
  max={max}
  step={step}
  value={numericValue}
  onChange={(event) => handleValueChange(field.id, event.target.value)}
  className="w-full"
  style={{ touchAction: "none" }}
  onTouchStart={(e) => e.stopPropagation()}
  onTouchMove={(e) => e.stopPropagation()}
/>
```

**Why `touch-action: none`:** This tells the browser "I'm handling touch events on this element myself — don't interpret them as scrolls, swipes, or navigation gestures." The native range input still works because it handles its own drag internally.

**Why `stopPropagation`:** Prevents the touch events from bubbling up to the SwipeToOpenDetector or AppSidebar's document-level listeners.

### Step 2: Manual test on mobile

- Open a scouting form with slider fields
- Drag sliders left and right — they should move smoothly
- Drag a slider near the left edge of the screen — sidebar should NOT open
- Swipe from the very left edge (outside the slider) — sidebar SHOULD still open
- Use browser back gesture from outside slider area — should still work

### Step 3: Commit

```bash
git add src/pages/DynamicScoutFormPage.tsx src/pages/PitScoutingPage.tsx src/pages/DriveTeamScoutingPage.tsx
git commit -m "fix: prevent slider touch events from triggering sidebar/back navigation on mobile"
```

---

## Task 3: Add Admin Notification for New Verification Requests

Currently, when a new external user signs in, the `RecentUser` record is created with `acknowledged=false`, but no notification is sent to admins. Admins must manually check `/verification-center`.

**Solution:** Send a web push notification to all users with `lead` or `tech_lead` roles when a new unacknowledged user appears. The push notification system already exists (`server/src/routes/push.js`).

**Files:**
- Modify: `server/src/routes/recentUsers.js` (PUT handler, ~lines 39-100)
- Modify: `server/src/routes/push.js` (may need to export `sendPushToSubscription` or add a helper)

### Step 1: Check existing push notification infrastructure

Read `server/src/routes/push.js` to understand:
- How push subscriptions are stored
- How notifications are sent
- What helper functions exist

### Step 2: Add notification trigger to recentUsers PUT route

In `server/src/routes/recentUsers.js`, after a new unacknowledged user is created (not updated), send a push notification to admin subscriptions.

**In the PUT handler (after the upsert), add:**

```javascript
// Only notify on NEW users (not updates to existing)
if (isNewUser && !acknowledged) {
  try {
    // Get all push subscriptions
    const subscriptions = await prisma.pushSubscription.findMany()

    // Get admin roles
    const adminRoles = await prisma.role.findMany({
      where: { role: { in: ['lead', 'tech_lead'] } }
    })
    const adminEmails = new Set(adminRoles.map(r => r.email))

    // Filter subscriptions to only admins
    const adminSubscriptions = subscriptions.filter(sub => adminEmails.has(sub.email))

    // Send notification to each admin
    const payload = JSON.stringify({
      title: 'New Account Request',
      body: `${displayName || email} is requesting access`,
      url: '/verification-center'
    })

    await Promise.allSettled(
      adminSubscriptions.map(sub => {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth }
        }
        return webpush.sendNotification(pushSubscription, payload)
      })
    )
  } catch (pushError) {
    console.warn('Failed to send admin notification for new user:', pushError.message)
  }
}
```

**To determine `isNewUser`:** Check whether the upsert created a new record or updated existing. Prisma's `upsert` doesn't directly tell you, so query first:

```javascript
const existing = await prisma.recentUser.findUnique({ where: { email } })
const isNewUser = !existing
```

Add this before the upsert call.

### Step 3: Import web-push

At the top of `recentUsers.js`, add:
```javascript
const webpush = require('web-push')
```

Ensure VAPID keys are configured (they should already be since push notifications exist).

### Step 4: Manual test

- Sign in with a new external email
- Check that lead/admin accounts receive a push notification
- Verify the notification links to `/verification-center`
- Verify existing user re-logins do NOT trigger duplicate notifications

### Step 5: Commit

```bash
git add server/src/routes/recentUsers.js
git commit -m "feat: send push notification to admins when new user requests verification"
```

---

## Task 4: Fix CSV Export for Google Sheets Compatibility

The user reports "Formula parse error" when importing the CSV into Google Sheets. The example sheet at `Rebuilt Test Data - Test Data.csv` shows the expected format.

**Root Cause Analysis:** The export at `/scouting/export/rebuilt?format=csv` likely has issues with:
1. **Fields starting with `=`, `+`, `-`, `@`** — Google Sheets interprets these as formulas
2. **Numeric values quoted as strings** — may cause type mismatch
3. **Column count mismatch** — if data has fewer/more columns than headers

**Files:**
- Modify: `server/src/routes/scouting.js` (~lines 743-763, CSV formatting functions)

### Step 1: Compare exported CSV with example CSV

Fetch the actual export and compare column-by-column with the example CSV. Check:
- Same number of columns (the example has 30 columns including "Climb" and "Notes")
- Same header names (exact match)
- Same value formatting (e.g., "Yes"/"No" for boolean, "Q"/"M" for qual/elim)

The example CSV has these headers:
```
Scout Team, Event, Timestamp, Scout Name, Match Number, Qual or Elim, Team Number, Climbed, Auto Strat, Auto Rating, Transition Strat, Transition Rating, Were they Defended? (Transition Period), First Active Phase Strat, First Active Phase Rating, Were they Defended? (First Active Phase), First Inactive Phase Strat, First Inactive Phase Rating, Were they Defended? (First Inactive Phase), Second Active Phase Strat, Second Active Phase Rating, Were they Defended? (Second Active Phase), Second Inactive Phase Strat, Second Inactive Phase Rating, Were they Defended? (Second Inactive Phase), Endgame Strat, Endgame Rating, Were they Defended? (Endgame), Climb, Notes
```

Compare with `REBUILT_TSV_HEADERS` in `scouting.js` (lines 72-103) — verify exact match.

### Step 2: Add formula injection prevention to `sanitizeCsvCell`

In `server/src/routes/scouting.js`, update `sanitizeCsvCell` (line 743-747):

**Before:**
```javascript
const sanitizeCsvCell = (value) => {
  const normalized = String(value ?? "").replace(/\r?\n/g, " ")
  const escaped = normalized.replace(/"/g, '""')
  return `"${escaped}"`
}
```

**After:**
```javascript
const sanitizeCsvCell = (value) => {
  let normalized = String(value ?? "").replace(/\r?\n/g, " ")
  // Prevent Google Sheets formula interpretation
  if (/^[=+\-@]/.test(normalized)) {
    normalized = "'" + normalized
  }
  const escaped = normalized.replace(/"/g, '""')
  return `"${escaped}"`
}
```

### Step 3: Ensure numeric rating values export as unquoted numbers

Check if rating values (Auto Rating, Transition Rating, etc.) are exported as `"6"` (quoted string) vs `6` (number). Google Sheets may handle these differently.

Look at `asNumberOrBlank()` (lines 242-247) — if it returns a number, the CSV formatter wraps it in quotes anyway via `sanitizeCsvCell`. This should be fine for Google Sheets since quoted numbers are still parsed as numbers, but verify.

### Step 4: Verify "Climbed" vs "Climb" column

The example CSV has BOTH "Climbed" (column 8, Yes/No/Failed Attempt) and "Climb" (column 29, Level 1/2/3/Did not attempt/Failed Attempt). Verify `REBUILT_TSV_HEADERS` includes both and `buildRebuiltRecord` populates both correctly.

### Step 5: Test the export

```bash
curl "https://api.team1676.org/scouting/export/rebuilt?format=csv" -o test_export.csv
```

Open in Google Sheets and verify:
- No formula parse errors
- All columns align with headers
- Data types are correct
- Compare against example CSV format

### Step 6: Commit

```bash
git add server/src/routes/scouting.js
git commit -m "fix: prevent formula parse errors in Google Sheets CSV export"
```

---

## Task 5: Remove Dynamic Scouting Infrastructure (cleanup)

After Task 1 hardcodes the forms, clean up the dynamic scouting infrastructure that's no longer needed.

**Files to modify:**
- Modify: `src/pages/GameStartPage.tsx` — remove active form ID logic, form sync
- Modify: `src/App.tsx` — remove `/form-maker` routes (or keep for admin but deprioritize)
- Modify: `src/components/DashboardComponents/app-sidebar.tsx` — remove Form Maker sidebar link

**Files to keep (do NOT delete):**
- `src/lib/formBuilderApi.ts` — still needed for `getForm()` fallback logic and local storage
- `src/lib/activeForm.ts` — may still be used elsewhere
- `src/data/hardcodedMatchForm.json` — now the primary form source
- `src/data/hardcodedPitForm.json` — already used by PitScoutingPage
- `src/pages/FormBuilderPage.tsx` — keep but remove from sidebar nav
- `src/pages/FormMakerPage.tsx` — keep but remove from sidebar nav

### Step 1: Remove Form Maker from sidebar navigation

In `src/components/DashboardComponents/app-sidebar.tsx`, find the sidebar menu item for "Form Maker" or "Form Builder" and remove it (or comment it out). This hides the dynamic form system from users without deleting the pages.

### Step 2: Remove activeFormId logic from GameStartPage

In `src/pages/GameStartPage.tsx`:
- Remove the state variable for `activeFormId`
- Remove the `useEffect` that calls `syncActiveFormConfig()` / `getActiveFormId("match")`
- Remove any imports from `@/lib/activeForm` that are no longer used
- The navigation should now always go to `/scout-form` (done in Task 1)

### Step 3: Manual test

- Verify sidebar no longer shows Form Maker link
- Verify scouting flow still works end-to-end
- Verify pit scouting still works (it uses hardcoded form, should be unaffected)

### Step 4: Commit

```bash
git add src/pages/GameStartPage.tsx src/components/DashboardComponents/app-sidebar.tsx
git commit -m "refactor: remove dynamic form infrastructure from user-facing UI"
```

---

## Implementation Order

Recommended order (dependencies noted):

1. **Task 1** (Hardcode match form) — highest impact, fixes slow loading
2. **Task 5** (Remove dynamic scouting) — cleanup after Task 1
3. **Task 2** (Fix sliders) — independent, quick fix
4. **Task 3** (Admin notifications) — independent, backend-only
5. **Task 4** (CSV export fix) — independent, backend-only

Tasks 2, 3, and 4 are fully independent of each other and can be done in parallel.

---

## Notes for Implementer

- **No automated test suite** — all verification is manual QA
- **The hardcoded JSON files already exist** in `src/data/` — check they're current before relying on them
- **PitScoutingPage already uses the hardcoded pattern** — use it as a reference for Task 1
- **The transformation pipeline** (`coercePages` → `normalizePagesOptionLabels` → `mergeStratRolesForPages` → `normalizeStratDefenseLabels`) must still run on the hardcoded data, but only ONCE at module load time
- **Push notification VAPID keys** must be configured in server environment — check `server/.env` for `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY`
- **CSV export endpoint** is at `/scouting/export/rebuilt?format=csv` — test with `curl` or browser

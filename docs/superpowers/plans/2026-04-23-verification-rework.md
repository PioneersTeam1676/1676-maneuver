# Verification Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove auto-verification on sign-in so all users start as `pending` and require admin approval, and fix event settings syncing for newly approved users.

**Architecture:** Three independent backend changes (userRegistration, events route auth, events PUT guard) followed by two frontend changes (AuthContext acknowledged flag, AllianceOnboardingPage nav + UI). No schema changes. No new routes.

**Tech Stack:** Express.js backend (Node.js), React 19 + TypeScript frontend, Prisma ORM, Vite build

---

## File Map

| File | Change |
|------|--------|
| `server/src/utils/userRegistration.js` | Remove `shouldAutoApprove`; always assign `pending` to new users |
| `server/src/index.js` | Switch `/events` router from `apiAuthMiddleware` to `openGoogleAuthMiddleware` |
| `server/src/routes/events.js` | Add lead-role guard to `PUT /settings` handler |
| `src/contexts/AuthContext.tsx` | `isAutoApprovedEmail` — remove domain match, keep admin emails only |
| `src/pages/AllianceOnboardingPage.tsx` | Call `syncEventSettings` on approval before nav; update UI copy |

---

## Task 1: Remove auto-approval from userRegistration.js

**Files:**
- Modify: `server/src/utils/userRegistration.js`

- [ ] **Step 1: Open the file and read the current state**

  Confirm the file matches what's expected (remove `shouldAutoApprove` and the `emailMatchesAllowedDomain` import).

- [ ] **Step 2: Replace the file content**

```js
const { prisma } = require("../db")
const { nowSeconds } = require("./dbUtils")
const { sanitizeString, upsertRecentUser } = require("./recentUserUtils")

const ensureScoutRegistration = async ({ email, displayName, photoUrl }) => {
  const normalizedEmail = sanitizeString(email).toLowerCase()
  if (!normalizedEmail) return null

  const existingRole = await prisma.role.findUnique({
    where: { email: normalizedEmail },
    select: { role: true },
  })

  let role = existingRole?.role || "pending"
  let changedRole = false

  if (!existingRole) {
    const timestamp = nowSeconds()
    await prisma.role.create({
      data: {
        email: normalizedEmail,
        role: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    })
    role = "pending"
    changedRole = true
  }

  if (changedRole && role !== "pending" && role !== "blocked") {
    await prisma.verifiedUser.create({
      data: {
        email: normalizedEmail,
        role,
        verifiedAt: nowSeconds(),
      },
    })
  }

  await upsertRecentUser(prisma, {
    email: normalizedEmail,
    lastSeenAt: new Date().toISOString(),
    acknowledged: role !== "pending",
    displayName,
    photoUrl,
  })

  return role
}

module.exports = {
  ensureScoutRegistration,
}
```

- [ ] **Step 3: Verify the server starts without errors**

  From `server/`:
  ```bash
  node -e "require('./src/utils/userRegistration')"
  ```
  Expected: no output (clean require, no crash).

- [ ] **Step 4: Commit**

  ```bash
  git add server/src/utils/userRegistration.js
  git commit -m "fix: remove auto-approval — all new users start as pending"
  ```

---

## Task 2: Open GET /events/settings + guard PUT /events/settings

**Files:**
- Modify: `server/src/index.js` (one line change)
- Modify: `server/src/routes/events.js` (add role guard to PUT)

### Part A — index.js

- [ ] **Step 1: Change events router middleware**

  In `server/src/index.js`, find the line:
  ```js
  app.use(resolvePath("/events"), apiAuthMiddleware, eventsRouter)
  ```
  Replace with:
  ```js
  app.use(resolvePath("/events"), openGoogleAuthMiddleware, eventsRouter)
  ```

  `openGoogleAuthMiddleware` is already defined two lines above — it accepts any valid Google ID token regardless of email domain or role.

### Part B — events.js

- [ ] **Step 2: Add role-check imports at the top of events.js**

  The current top of the file is:
  ```js
  const express = require("express")
  const router = express.Router()
  const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
  const asyncHandler = require("../utils/asyncHandler")
  const { nowSeconds } = require("../utils/dbUtils")
  ```

  Replace with:
  ```js
  const express = require("express")
  const router = express.Router()
  const { prisma } = require("../db")
  const { getSeasonPrisma, resolveSeasonSelector } = require("../seasonDb")
  const asyncHandler = require("../utils/asyncHandler")
  const { nowSeconds } = require("../utils/dbUtils")

  const LEAD_ROLES = new Set(["lead", "tech_lead"])

  const getRequesterRole = async (email) => {
    if (!email) return null
    const row = await prisma.role.findUnique({
      where: { email: String(email).trim().toLowerCase() },
      select: { role: true },
    })
    return row?.role || null
  }
  ```

- [ ] **Step 3: Add lead-role guard to PUT /settings**

  The current PUT handler opens with:
  ```js
  router.put(
    "/settings",
    asyncHandler(async (req, res) => {
      const { currentEvent, events, eventDisplayNames } = req.body || {}
  ```

  Replace that opening with:
  ```js
  router.put(
    "/settings",
    asyncHandler(async (req, res) => {
      const requesterRole = await getRequesterRole(req.user?.email)
      if (!LEAD_ROLES.has(requesterRole)) {
        return res.status(403).json({ error: "Lead access required" })
      }

      const { currentEvent, events, eventDisplayNames } = req.body || {}
  ```

  Everything after `const { currentEvent, events, eventDisplayNames }` stays unchanged.

- [ ] **Step 4: Verify the server starts without errors**

  From `server/`:
  ```bash
  node -e "require('./src/routes/events')"
  ```
  Expected: no output.

- [ ] **Step 5: Commit**

  ```bash
  git add server/src/index.js server/src/routes/events.js
  git commit -m "fix: open GET /events/settings to all authed users; guard PUT to leads"
  ```

---

## Task 3: Fix isAutoApprovedEmail in AuthContext.tsx

**Files:**
- Modify: `src/contexts/AuthContext.tsx`

- [ ] **Step 1: Find and update isAutoApprovedEmail**

  Current (around line 109):
  ```ts
  const isAutoApprovedEmail = (email: string) => {
    const normalized = normalizeEmail(email)
    return ADMIN_EMAILS.includes(normalized) || ULTRA_ADMIN_EMAILS.includes(normalized) || emailMatchesAllowedDomain(normalized)
  }
  ```

  Replace with:
  ```ts
  const isAutoApprovedEmail = (email: string) => {
    const normalized = normalizeEmail(email)
    return ADMIN_EMAILS.includes(normalized) || ULTRA_ADMIN_EMAILS.includes(normalized)
  }
  ```

  This means domain users (`@pascack.org`) are no longer pre-acknowledged in the admin's recent-users list. Every new signin appears in the VerificationCenterPage queue regardless of domain.

- [ ] **Step 2: Commit**

  ```bash
  git add src/contexts/AuthContext.tsx
  git commit -m "fix: domain users no longer auto-acknowledged in verification queue"
  ```

---

## Task 4: AllianceOnboardingPage — sync event settings on approval + UI copy

**Files:**
- Modify: `src/pages/AllianceOnboardingPage.tsx`

- [ ] **Step 1: Add syncEventSettings import**

  Current import block at the top of the file:
  ```ts
  import { apiPut } from "@/lib/apiClient"
  ```

  Replace with:
  ```ts
  import { apiPut } from "@/lib/apiClient"
  import { syncEventSettings } from "@/lib/eventSettingsClient"
  ```

- [ ] **Step 2: Update the role-transition useEffect**

  Current (around line 22):
  ```ts
  useEffect(() => {
    if (role !== "pending" && role !== "blocked") {
      if (prevRoleRef.current === "pending" || prevRoleRef.current === "blocked") {
        toast.success("You've been approved! Welcome to the scouting app.")
      }
      navigate(defaultRoute, { replace: true })
    }
    prevRoleRef.current = role
  }, [role, defaultRoute, navigate])
  ```

  Replace with:
  ```ts
  useEffect(() => {
    if (role !== "pending" && role !== "blocked") {
      if (prevRoleRef.current === "pending" || prevRoleRef.current === "blocked") {
        toast.success("You've been approved! Welcome to the scouting app.")
        syncEventSettings()
          .catch(() => {})
          .finally(() => {
            navigate(defaultRoute, { replace: true })
          })
      } else {
        navigate(defaultRoute, { replace: true })
      }
    }
    prevRoleRef.current = role
  }, [role, defaultRoute, navigate])
  ```

  The `syncEventSettings` call is fire-and-forget from the error perspective — we always navigate. But by awaiting it in `finally`, the event name is in localStorage before GameStartPage reads it.

- [ ] **Step 3: Update UI copy to remove domain auto-approval note**

  Find the paragraph inside `CardContent` that references the allowed domain (around line 100–106):
  ```tsx
  <p>
    {role === "blocked"
      ? <>This account is currently blocked from scouting access. Refreshing will not submit a new approval request.</>
      : <>Accounts using the <Badge variant="outline" className="mx-1">@{allowedAllianceDomain}</Badge> domain are
          granted scouting access automatically. Others must wait for approval from a 1676 admin.</>}
  </p>
  ```

  Replace with:
  ```tsx
  <p>
    {role === "blocked"
      ? <>This account is currently blocked from scouting access. Refreshing will not submit a new approval request.</>
      : <>All accounts require approval from a Team 1676 admin before accessing the scouting app. You&apos;ll be redirected automatically once approved.</>}
  </p>
  ```

- [ ] **Step 4: Remove allowedAllianceDomain from the destructure** (it's no longer used in JSX)

  Current hook call at the top of the component:
  ```ts
  const { user, role, allowedAllianceDomain, defaultRoute, refreshRoles } = useAuth()
  ```

  Replace with:
  ```ts
  const { user, role, defaultRoute, refreshRoles } = useAuth()
  ```

- [ ] **Step 5: Verify TypeScript compiles cleanly**

  From repo root:
  ```bash
  npx tsc --noEmit
  ```
  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/AllianceOnboardingPage.tsx
  git commit -m "fix: sync event settings on approval; remove domain auto-approval copy"
  ```

---

## Manual QA Checklist

After all tasks are complete:

**Verification gate:**
- [ ] Sign in with a `@pascack.org` account on a fresh session (clear localStorage first, or use incognito). Confirm you land on `/alliance-onboarding` instead of being auto-routed to `/`.
- [ ] Confirm the VerificationCenterPage shows the new user as unacknowledged.
- [ ] Have a lead approve the user. Confirm the user is redirected to the default route within 30 seconds.
- [ ] Repeat with a non-domain Google account (alliance scout). Confirm same pending → approval flow.

**Event settings:**
- [ ] After a non-domain user is approved and navigates to GameStartPage, confirm the event name field shows the correct event (not "Awaiting event assignment").
- [ ] Confirm a lead can still change the event via EventSettingsPage (PUT is still guarded).
- [ ] Confirm a scout cannot change the event (PUT returns 403 if attempted).

**Regression:**
- [ ] Confirm existing users with `scout`+ roles are unaffected — they sign in and land on their normal default route immediately.
- [ ] Confirm configured admin emails (VITE_ULTRA_ADMIN_EMAIL) still get `tech_lead` on the frontend without needing approval.

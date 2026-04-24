# Verification Rework + Event Sync Fix

**Date:** 2026-04-23  
**Status:** Approved

## Problem

### 1. Auto-verification on sign-in

Every user who signs in with a `@pascack.org` email is immediately assigned `scout` role by `ensureScoutRegistration` in `server/src/utils/userRegistration.js`. This bypasses the entire verification flow — nobody ever lands in the VerificationCenterPage queue. Non-domain users (alliance scouts from other teams) correctly get `pending`, but domain users skip the gate entirely.

### 2. "Awaiting event assignment" for newly verified users

Non-domain users sit on `AllianceOnboardingPage` while pending. During this time, `GET /events/settings` returns 403 (they fail the domain check in `apiAuth.js`). `syncEventSettings` never succeeds, so localStorage never has `eventName`. After an admin approves them, they navigate to GameStartPage and see "Awaiting event assignment" because their event name is empty. `EventNameSelector` fires `syncEventSettings` async on mount and eventually fills it in, but there is a visible delay and it fails entirely if the component unmounts before the request completes.

---

## Design

### Section 1: Remove auto-verification (backend)

**File:** `server/src/utils/userRegistration.js`

Remove `shouldAutoApprove` and the `emailMatchesAllowedDomain` import entirely. All new users always receive `pending` role, regardless of email domain. The `else if` branch that upgrades pending domain users to `scout` is also removed.

The `verifiedUser` record creation stays — it only fires when `changedRole && role !== "pending" && role !== "blocked"`, which will no longer trigger from this function for any new user.

```js
// Before (simplified)
const shouldAutoApprove = emailMatchesAllowedDomain(normalizedEmail)
const targetRole = shouldAutoApprove ? "scout" : "pending"

// After
const targetRole = "pending"
```

**File:** `server/src/middleware/apiAuth.js`

No change. Domain users still pass the domain check in middleware (they can call the API while pending — required for self-registration and recent-user upsert). They just won't have scout role in the DB, so the frontend redirects them to `/alliance-onboarding`.

**File:** `server/src/routes/recentUsers.js`

No change. `POST /recent-users/self-register-role` calls `ensureScoutRegistration`, which now always returns `pending` for new users.

### Section 2: Event settings accessible to all authenticated users

**File:** `server/src/index.js`

Change the `/events` router registration from `apiAuthMiddleware` to `openGoogleAuthMiddleware`. This allows any user with a valid Google ID token (including pending/non-domain users) to call `GET /events/settings`.

```js
// Before
app.use(resolvePath("/events"), apiAuthMiddleware, eventsRouter)

// After
app.use(resolvePath("/events"), openGoogleAuthMiddleware, eventsRouter)
```

**File:** `server/src/routes/events.js`

Add a lead-role guard inside the `PUT /settings` handler so only `lead`/`tech_lead` can write event settings. Reads remain open to all authenticated users.

```js
router.put("/settings", asyncHandler(async (req, res) => {
  const requesterRole = await getRequesterRole(req.user?.email)
  if (!LEAD_ROLES.has(requesterRole)) {
    return res.status(403).json({ error: "Lead access required" })
  }
  // ... existing update logic
}))
```

Add the `getRequesterRole` helper (same pattern as `recentUsers.js`) and `LEAD_ROLES` set at the top of the file.

### Section 3: Sync event settings on approval + UI updates

**File:** `src/pages/AllianceOnboardingPage.tsx`

In the `useEffect` that detects role transition from pending/blocked → approved, call `syncEventSettings()` before navigating. Navigate regardless of whether the sync succeeds (fire-and-forget with `.catch` no-op):

```ts
useEffect(() => {
  if (role !== "pending" && role !== "blocked") {
    if (prevRoleRef.current === "pending" || prevRoleRef.current === "blocked") {
      toast.success("You've been approved! Welcome to the scouting app.")
      syncEventSettings().catch(() => {}).finally(() => {
        navigate(defaultRoute, { replace: true })
      })
    } else {
      navigate(defaultRoute, { replace: true })
    }
    prevRoleRef.current = role
  }
}, [role, defaultRoute, navigate])
```

Also update the UI copy to reflect that all users wait for admin approval (not just non-domain users). Remove the `@{allowedAllianceDomain}` auto-approval note.

**File:** `src/contexts/AuthContext.tsx`

`isAutoApprovedEmail` currently returns `true` for all allowed-domain emails, causing them to appear pre-acknowledged in the VerificationCenterPage. Change it to only return `true` for configured admin/ultra-admin emails:

```ts
const isAutoApprovedEmail = (email: string) => {
  const normalized = normalizeEmail(email)
  return ADMIN_EMAILS.includes(normalized) || ULTRA_ADMIN_EMAILS.includes(normalized)
}
```

This ensures all new signins (including `@pascack.org` users) appear unacknowledged in the admin's queue.

---

## Files Changed

| File | Change |
|------|--------|
| `server/src/utils/userRegistration.js` | Remove `shouldAutoApprove`; always assign `pending` |
| `server/src/index.js` | Switch `/events` to `openGoogleAuthMiddleware` |
| `server/src/routes/events.js` | Add lead-role check in PUT handler |
| `src/pages/AllianceOnboardingPage.tsx` | Sync event settings on approval; update UI copy |
| `src/contexts/AuthContext.tsx` | `isAutoApprovedEmail` only true for admin emails |

---

## Behaviour After Change

| User type | Sign-in result | API access | Route access |
|-----------|---------------|------------|--------------|
| `@pascack.org` user (new) | `pending` | Full (domain passes middleware) | `/alliance-onboarding` only |
| Non-domain user (new) | `pending` | `/recent-users`, `/events` (settings read) | `/alliance-onboarding` only |
| Any user after admin approves | assigned role | Full | Per role |
| Admin emails (env var) | `pending` DB, frontend gives lead/tech_lead | Full | Per role |

## Non-Goals

- No change to how admin emails are bootstrapped (env vars, frontend only).
- No change to the VerificationCenterPage UI — it already handles the pending queue correctly.
- No change to the `blocked` role flow.
- No changes to any scouting data routes.

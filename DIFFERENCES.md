# Differences: This Version vs Base Maneuver

Comparing `/srv/md0/robotics/maneuver-qe` (Pioneer Scouting) against:
- `ShinyShips/maneuver-core` — year-agnostic framework template
- `ShinyShips/Maneuver-2026` — 2026 game-specific implementation

---

## Branding

| Aspect | Base (maneuver-core / 2026) | This Version |
|--------|----------------------------|--------------|
| App name | "Maneuver Core" / "Maneuver-2026" | "Pioneer Scouting - A FRC Strategy Suite" |
| Package name | generic | `pioneer-scouting` |
| Team | none / generic | Team 1676 "The Pascack Pi-oneers" |
| Logo | Maneuver wordmark SVG | `pioneer.png` (team-specific icon) |
| Primary color | OKLch white/near-black (system-agnostic) | Gold `#FFCC00` + Black `#000000` |
| Default theme | Dark/Light toggle | Dark mode default |
| Font | Titillium Web | Titillium Web (same) |
| Domain | `maneuver.netlify.app` | `scouting.team1676.org` |
| Dev port | 5173 (Vite default) | 4176 (custom, to run alongside base) |
| Deployment | Netlify | PM2 on local server |
| Manifest name | "Maneuver" | "Pioneer Scouting - A FRC Strategy Suite" |
| GA4 tracking | G-QC65PEFPDJ | G-QC65PEFPDJ (same — forked from base) |

---

## Architecture

| Aspect | Base | This Version |
|--------|------|--------------|
| Backend | None (client-only) | Express.js + MySQL + Prisma ORM |
| Auth system | None (trust-based, scout picked by name) | Google OAuth 2.0 with RBAC |
| Data storage | IndexedDB only (Dexie) | IndexedDB (local cache) + MySQL (server) |
| Data sync | QR codes, JSON, WebRTC P2P | HTTP API to Express backend |
| Codebase structure | `src/core/` + `src/game-template/` (clean separation) | Flat monolithic `src/` (no core/game split) |
| State management | 7 React contexts (GameContext, ScoutContext, WebRTCContext, etc.) | AuthContext + FullscreenContext only |
| Test suite | Vitest unit tests (2026 version) | None (manual QA only) |
| Deployment target | Netlify (serverless) | Self-hosted server with PM2 |

---

## Features ONLY in This Version (not in base)

### Authentication & Access Control
- Google OAuth 2.0 login flow with ID tokens
- 9-role RBAC hierarchy: `scout_minus → scout → scout_plus → lead → tech_lead`
- Email domain whitelisting (configurable via env)
- Route-level permission guards
- Auto-approval for members of allowed domain
- Admin/ultra-admin via env var email list
- Session renewal flow (silent popup refresh, iOS PWA fallback)
- SessionRenewalBanner component (polls token validity every 15s)

### Backend & Server-Side
- Express.js API server (`server/`)
- Prisma ORM with MySQL
- 12 backend route files: scouting, pit, roles, rescout, game, forms, events, schedule, push, recentUsers, verifiedUsers, webhookSync
- Server-side role assignment API
- Bulk scouting sync with per-entry fallback
- Slow sync warning (toast if >6s)

### User Management
- `UserManagementPage` — assign roles, view all users
- `VerificationCenterPage` — verify/acknowledge new users
- `AdminPanelPage` — full admin controls
- Alliance onboarding flow (`AllianceOnboardingPage`, `AllianceOnboardingDialog`)
- Alliance profiles with first name, last name, team number

### Rescouting System
- `RescouterPage` — manage rescouting of already-scouted matches
- Per-user rescouter permission override (from server)
- Heartbeat tracking for active rescouters
- `scout_plus` role has rescouting access

### Shift Generator
- `ShiftGeneratorPage` (~47KB) — automated scout scheduling
- CSV import/parse for schedules
- Auto-assign scouts to match positions
- Spatial clustering for pit assignments

### Scout Activity & Tracking
- `ScoutActivityPage` — per-scout activity log
- `DriveTeamScoutingPage` — drive team specific scouting (separate from match scouts)
- `ScoutManagementDashboardPage` — extended management beyond base

### Data
- Outlier detection (`OutlierDetectionPage`, integrated into data management)
- `EventSettingsPage` — per-event configuration (39KB)
- `MatchResultsPage` — match outcome display with TBA API key input

### Infrastructure
- Web Push notifications (VAPID-based match reminders, `push.js` backend route)
- `MatchReminderToggle` + `MatchReminderBackground` components
- `GlobalFooter` — attribution footer shown app-wide
- Legal pages: `TOSPage`, `PrivacyPolicyPage`
- `LandingPage` — public-facing landing before login

---

## Features ONLY in Base (not in this version)

### WebRTC Peer-to-Peer Transfer
- `PeerTransferPage` — direct device-to-device transfer (no server needed)
- `WebRTCContext` (51.6KB) — full P2P connection management
- 4 WebRTC hooks: `useWebRTCQRTransfer`, `usePeerTransferImport`, `usePeerTransferPush`, `useWebRTCSignaling`
- `webrtc/` component folder
- `peer-transfer/` component folder

### Match Validation
- `MatchValidationPage` — compare scouted data against TBA official results
- `useMatchValidation` hook
- `useConflictResolution` hook
- `validationCorrections.ts` (2026 version)

### Architecture Patterns
- `GameContext` — central game abstraction for plugging in game-specific logic
- `ScoutContext` — clean scout selection abstraction (vs AuthContext doing everything)
- `SettingsContext` — app-wide settings/preferences
- `DataSyncContext` — data synchronization abstraction
- `NotificationContext` — toast/alert queue context
- `src/core/` + `src/game-template/` folder separation
- Central `game-schema.ts` config file driving workflow toggles, actions, points

### Testing
- Vitest unit tests (2026 only): `fuelOpr.test.ts`, `rollingFuelOpr.test.ts`, `rollingOpr.test.ts`
- Automated test suite for game calculations

### 2026-Specific (Maneuver-2026 only)
- Fuel bulk counting (+1/+5/+10 buttons)
- 3-level tower climb tracking (L1/L2/L3)
- Hub state tracking (active/inactive)
- Teleop role selection (Cycler, Clean Up, Passer, Thief, Defense)
- `auto-path` and `teleop-path` path visualization components
- `useFieldOrientation` hook
- Experiment database (`ExperimentSession`, `ExperimentResponse`, `AnswerKey`, `PreferenceForm`)
- `fuelOpr.ts`, `rollingFuelOpr.ts`, `rollingOpr.ts` calculation files
- `GAME_2026.md` documentation

---

## Features in Both (same or equivalent)

- Match scouting workflow (GameStart → Auto → Teleop/Scoring → Endgame)
- Pit scouting
- Pit assignments
- QR fountain code data transfer (Luby Transform LT codes)
- TBA API integration
- Scout management dashboard (extended in this version)
- Clear data page
- Dev utilities page
- Dexie.js IndexedDB (3 databases: match, pit, scout profiles)
- PWA (service worker, offline support, install prompts, app shortcuts)
- `BottomNavigation` mobile nav
- `NavigationConfirmDialog` unsaved changes warning
- `PageHelpTooltip` contextual help
- `SplashScreen`
- `ScrollToTop`
- `StatusBarSpacer`
- `mode-toggle` dark/light
- `DataAttribution`
- `useScoutingSession`, `useCurrentScout`, `useMatchStrategy`, `useNavigationConfirm`
- `useCanvasSetup`, `useCanvasDrawing`
- `useDataStats`, `useDataCleaning`, `useChartData`
- `usePWA`, `use-mobile`
- Recharts / D3 for visualization
- Framer Motion animations
- shadcn/ui + Radix UI component library
- Tailwind CSS
- React + TypeScript + Vite build
- Zod validation
- Lucide + Tabler icons

---

## What's Notably Absent from This Version vs Base

- No clean `core/` vs `game/` code separation — everything is flat
- No WebRTC P2P (replaced by server sync)
- No match validation against TBA
- No `GameContext` abstraction (game logic is baked into pages)
- No `SettingsContext` (settings scattered across pages/localStorage)
- No automated tests
- No Netlify config (self-hosted instead)
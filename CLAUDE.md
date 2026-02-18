# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maneuver is a mobile-first FRC (FIRST Robotics Competition) scouting application. Teams use it to collect match data (auto/teleop/endgame phases), perform pit scouting, analyze team statistics, and manage alliance selection during competitions.

## Commands

### Frontend (run from repo root)
- `npm run dev` — Vite dev server (port 4175)
- `npm run host` — Dev server accessible on LAN
- `npm run build` — Type-check + Vite build + PM2 restart
- `npm run lint` — ESLint
- `npm run preview` — Preview production build (port 4174)

### Backend (run from `server/`)
- `npm run dev` — Express server with nodemon (port 4000)
- `npm start` — Production mode

### Docker
- `docker-compose up --build` — Containerized API on port 4000

### No automated test suite
Manual QA is the testing approach. Useful utilities: `scripts/testCompression.js` and `src/lib/testDataGenerator.ts`.

## Architecture

### Tech Stack
- **Frontend**: React 19 + TypeScript 5.8, Vite 6, Tailwind CSS 4 + shadcn/ui (Radix primitives)
- **Backend**: Express.js, MySQL via Prisma ORM
- **Client DB**: Dexie (IndexedDB wrapper) — three databases defined in `src/lib/dexieDB.ts` (authoritative source)
- **PWA**: vite-plugin-pwa with NetworkFirst caching strategy

### Client-First Data Architecture
All scouting data is stored locally in IndexedDB (Dexie) first, then optionally synced to the MySQL backend. Three client-side databases:
1. **SimpleScoutingAppDB** — Match scouting entries
2. **PitScoutingDB** — Pit scouting entries
3. **ScoutProfileDB** — Scout profiles, predictions, achievements

The backend (Prisma schema at `server/prisma/schema.prisma`) mirrors this with 13 models. Sync is on-demand with client ID → server ID mapping.

### Authentication & Roles
Google OAuth 2.0 with RBAC managed in `src/contexts/AuthContext.tsx`. Role hierarchy: pending → scout → lead → form_maker → admin → ultra_admin. Domain whitelisting via `VITE_ALLOWED_EMAIL_DOMAIN(S)` env vars.

### Key Integration Points
- **The Blue Alliance API** (`src/lib/tbaUtils.ts`) — Match schedules, team info
- **Web Push** — Match reminder notifications (VAPID keys)
- **Data Transfer** — Luby Transform fountain codes for offline QR-based data sharing

### Frontend Structure
- `src/pages/` — ~40 page components (route destinations)
- `src/components/` — Reusable UI; `src/components/ui/` is shadcn/ui base
- `src/contexts/` — AuthContext (auth/roles), FullscreenContext
- `src/hooks/` — Custom hooks (useScoutingSession, useTeamStatistics, usePWA)
- `src/lib/` — Utilities, API clients, type definitions, database schemas
- `src/types/` — Shared TypeScript types

### Backend Structure
- `server/src/routes/` — Express route handlers (roles, scouting, pit, forms, schedule, push, etc.)
- `server/src/middleware/apiAuth.js` — API authentication
- `server/prisma/schema.prisma` — Database schema (13 models)

## Coding Conventions
- 2-space indentation
- PascalCase for components (e.g., `MatchDataQRPage.tsx`)
- `useX` naming for hooks in `src/hooks/`
- Use `@/` import alias for frontend internal modules (configured in tsconfig)
- Frontend env vars must be prefixed with `VITE_`
- Lint before committing: `npm run lint`

## Adding a New Page
1. Create component in `src/pages/`
2. Add route in `src/App.tsx`
3. Add sidebar link in `src/components/DashboardComponents/app-sidebar.tsx`

## Adding a Database Model
1. Add model to `server/prisma/schema.prisma`
2. Run `npx prisma migrate dev` or `npx prisma db push`
3. Create route handler in `server/src/routes/`
4. Call from frontend via `src/lib/apiClient.ts`

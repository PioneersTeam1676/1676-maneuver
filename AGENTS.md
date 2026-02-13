# Repository Guidelines

## Project Structure & Module Organization
- `src/`: React + TypeScript frontend (UI, pages, hooks, contexts, shared libs/types).
- `server/src/`: Express API and backend logic.
- `public/`: static files served as-is; `src/assets/`: bundled frontend assets.
- `data/` and `server/data/`: local runtime data.
- Build outputs: `dist/` and `dev-dist/`.
- Utility scripts: `scripts/` (for example, `scripts/testCompression.js`).

## Build, Test, and Development Commands
Run frontend commands from the repository root:
- `npm run dev`: start Vite dev server.
- `npm run host`: start dev server on LAN (`--host`).
- `npm run build`: type-check and build frontend, then restart PM2 process.
- `npm run preview`: serve the production build locally.
- `npm run lint`: run ESLint across the repo.

Run backend commands from `server/`:
- `npm start`: run API with Node.
- `npm run dev`: run API with `nodemon` for live reload.

Optional containerized API: `docker-compose up --build` (port `4000`).

## Coding Style & Naming Conventions
- Language stack: TypeScript + React (frontend), Node/Express (backend).
- Use existing style with 2-space indentation.
- Components: PascalCase (example: `MatchDataQRPage.tsx`).
- Hooks: `useX` naming in `src/hooks/`.
- Prefer `@/` imports for frontend internal modules (configured in `tsconfig.json`).
- Lint before opening a PR: `npm run lint`.

## Testing Guidelines
- No dedicated automated test runner is configured.
- Required checks: manual QA for changed flows plus linting.
- Useful local checks: `scripts/testCompression.js` and `src/lib/testDataGenerator.ts`.

## Commit & Pull Request Guidelines
- Recent history uses concise, imperative commit subjects (for example, `Secure API and enable dynamic pit scouting`).
- Keep commits focused on one concern.
- PRs should include:
  - clear summary of what changed and why,
  - testing notes (commands run, manual checks),
  - screenshots or short recordings for UI changes,
  - linked issue/task when applicable.

## Security & Configuration Notes
- Keep secrets out of Git; use `.env` files.
- Frontend config uses `VITE_` environment variables.
- Backend config is loaded via `dotenv` or Docker environment settings.

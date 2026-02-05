# Repository Guidelines

## Project Structure & Module Organization
- `src/` is the React + TypeScript frontend. Key folders: `src/components/`, `src/pages/`, `src/layouts/`, `src/hooks/`, `src/contexts/`, `src/lib/`, and `src/types/`.
- `server/` is the Express + SQLite backend (`server/src/`).
- `public/` holds static assets served by Vite; `src/assets/` holds bundled assets.
- `data/` and `server/data/` are local data directories; `dist/` and `dev-dist/` are build outputs.
- Utility scripts live in `scripts/` (e.g., `scripts/testCompression.js`).

## Build, Test, and Development Commands
Frontend (repo root):
```bash
npm run dev      # start Vite dev server
npm run host     # dev server exposed on LAN
npm run build    # type-check + Vite build + PM2 restart (prod)
npm run preview  # serve built assets locally
npm run lint     # ESLint over the repo
```
Backend (in `server/`):
```bash
npm start        # run API
npm run dev      # nodemon watch mode
```
Docker API (optional): `docker-compose up --build` (exposes port 4000).

## Coding Style & Naming Conventions
- Language: TypeScript + React (Vite). Follow existing file style; 2-space indentation is common.
- Components use PascalCase (`MatchDataQRPage.tsx`); hooks use `useX` naming in `src/hooks/`.
- Prefer path aliases with `@/` (see `tsconfig.json`) for imports inside `src/`.
- Linting: ESLint (`eslint.config.js`). Run `npm run lint` before submitting.

## Testing Guidelines
- No dedicated test runner is configured. Use manual QA and linting.
- Helpful utilities include `scripts/testCompression.js` and `src/lib/testDataGenerator.ts` for local checks.

## Commit & Pull Request Guidelines
- This checkout is not a Git repository, so no commit history is available to infer conventions.
- Use concise, imperative commit messages (e.g., “Add match export UI”) and keep PRs focused.
- PRs should include a clear description, testing notes, and screenshots for UI changes.

## Configuration & Security Notes
- Frontend env vars live in a root `.env` (see `README.md` for `VITE_` keys).
- Backend env vars are read via `dotenv` or Docker (`server/package.json`, `docker-compose.yml`).
- Never commit secrets; prefer `.env` and deployment-specific configs.

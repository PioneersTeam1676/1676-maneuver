# Running Maneuver: new season checklist and operations guide

This is the one page to read before each season (or after a server rebuild).

## 1. Before the season

1. **Environment.** Copy `.env.example` to `.env` (repo root). The server reads
   the root `.env` too, so one file is enough. Check at least:
   - `VITE_GOOGLE_CLIENT_ID` (and the same value reaches the server as
     `GOOGLE_CLIENT_ID` / `VITE_GOOGLE_CLIENT_ID`).
   - `VITE_ALLOWED_EMAIL_DOMAIN(S)`: accounts on these domains are scouts
     automatically; everyone else must be approved in Verification Center.
   - `VITE_GOOGLE_ADMIN_EMAIL` (tech lead, comma-separated) and optionally
     `ADMIN_EMAILS` (lead). The server writes these into the `roles` table at
     boot and on sign-in, so a brand-new database always has someone who can
     approve people.
   - `AUTH_JWT_SECRET`: set it to a long random string and never change it
     mid-event. If it is missing the server generates one and stores it in
     `server/data/.auth-jwt-secret`; keep that file (it is in the Docker
     volume). Losing or changing the secret signs every device out.
   - `VITE_API_BASE_URL`: the API URL the app should call. When it is set,
     the app only ever talks to that URL (plus localhost during local dev).
2. **Google Cloud.** The OAuth client must list the exact callback URL
   `https://<app-host>/auth/google/callback` as an authorized redirect URI
   and the app origin as an authorized JavaScript origin.
3. **New game form.** In Form Maker, build this year's match form (set its
   year, e.g. `2027`) and mark it active. The scout form uses the active match
   form automatically as soon as its year differs from the built-in form's
   year (`HARD_CODED_MATCH_FORM_SOURCE` in `src/pages/ScoutFormPage.tsx`), so
   no code change is needed. To make a new built-in form instead, replace that
   JSON. Same for pit (`src/data/pitScoutForm.json`).
4. **Season database (optional).** In Form Maker you can point a season year
   at its own MySQL database. Otherwise everything lives in the main DB.
5. **Event.** In Event Settings, set the current event key (e.g. `2027njfla`).
   Its year decides which season database un-scoped requests use. Pin it with
   `ACTIVE_SEASON_YEAR` on the server if needed.
6. **Export sheet.** `GET /scouting/export/rebuilt` produces the 2026
   "Rebuilt" sheet layout (`SCOUT_TEAM_NAME` fills the Scout Team column).
   For a new game use `GET /scouting/export/raw?format=csv`, which exports
   every stored field of whatever form was used.

## 2. How sign-in works (and why sessions survive)

- The device signs in with Google once, then trades the Google token for the
  server's own tokens (`POST /auth/session`): an access token (5 days) and a
  refresh token (valid until logout). Renewal (`POST /auth/refresh`) needs only
  our server, not Google, so venue WiFi without internet is fine.
- A server/database outage is reported as "server down", never as "session
  expired"; the device keeps its sign-in and its queued entries.
- Roles are checked on every request against the `roles` table, so approving
  or blocking someone takes effect immediately.

## 3. Where data lives and how to get it out

| Copy | Where | Kept | How to pull it |
| --- | --- | --- | --- |
| Device sync cache | IndexedDB on each device | until synced and refreshed | Data pages |
| **Device backup** | IndexedDB `LocalBackupDB` on each device | **24 h** (`VITE_LOCAL_BACKUP_HOURS`) | Sidebar, **Device Backup**: Download JSON / CSV / Share. Works offline and with a broken login. |
| Server database | MySQL | permanent | Data pages, exports |
| **Server snapshots** | `server/data/backups/*.json` | **24 h** (`BACKUP_RETENTION_HOURS`), hourly (`BACKUP_INTERVAL_MINUTES`) | Leads: Device Backup page, "Server snapshots"; or copy the files off the server |

Every match, pit and drive-team save is written to the device backup first,
before the normal save, and nothing else ever edits it. To move data from a
phone that cannot sync: Device Backup, Download JSON (or Share), then on any
signed-in device open Device Backup, "Restore a backup file". Restoring only
queues uploads; the server upserts by entry id, so nothing is duplicated.

## 4. During an event: quick troubleshooting

- **"Scouting server is down" banner:** API reachable but MySQL is not (or the
  API is unreachable). Entries keep saving on the device. Check `GET /health`.
- **"Session expired" banner:** the server rejected the refresh token (logged
  out elsewhere, blocked, or the signing secret changed). Tap Renew.
- **Someone stuck on "request sent":** approve them in Verification Center. If
  approving fails with 403, your own account is not lead/tech lead on the
  server: add it to `VITE_GOOGLE_ADMIN_EMAIL` and restart the API.
- **Data missing from views:** check Event Settings' current event and
  Data Management's season selector point at the same year.

## 5. Tests

```bash
npm test            # frontend (vitest)
cd server && npm test   # backend (jest)
npm run lint
```

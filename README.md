# 1676's Maneuver Fork (by [Alex Radu](https://alexradu.co/))

A mobile-first scouting app for FRC teams, maintained by Team 1676 (the Pioneers). It is a fork of the original Maneuver with Google sign-in and role-based access added on top.

## Features

- Match scouting for auto, teleop, and endgame
- Pit scouting
- Team stats and alliance selection tools
- Works offline, with data shared by QR code or synced to a server
- Google sign-in with roles for scouts, leads, and admins

## Setup

You need Node.js and a MySQL database.

```bash
# frontend (one .env at the repo root; the server reads it too)
cp .env.example .env
npm install
npm run dev

# backend
cd server
npm install
npx prisma db push
npm run dev
```

The frontend dev server runs on port 4176 and the API on port 4000.

**Before each season, read [docs/NEW_SEASON.md](docs/NEW_SEASON.md)**: setup
checklist, how sign-in and roles work, where data is backed up (24-hour device
backup and server snapshots) and how to pull it off, and troubleshooting.

## Stack

React, TypeScript, Vite, Tailwind, Express, Prisma, and MySQL.

## License

Proprietary, source-available. See [LICENSE](LICENSE).
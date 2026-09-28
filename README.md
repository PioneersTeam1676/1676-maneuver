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
# you do this for teh frontend
cp .env.example .env
npm install
npm run dev

# then for the backend you do this
cd server
cp .env.example .env
npm install
npx prisma db push
npm run dev
```

The frontend runs on port 4175 and the API on port 4000. Fill in both `.env` files before starting.

## Stack

React, TypeScript, Vite, Tailwind, Express, Prisma, and MySQL.

## License

Proprietary, source-available. See [LICENSE](LICENSE).
# Maneuver (Pioneer Scouting)

## Project Overview

Maneuver is a comprehensive, mobile-first scouting application for FIRST Robotics Competition (FRC) teams. This fork (`pioneer-scouting`) extends the original Maneuver platform with enterprise-grade authentication, role-based access control (RBAC), and centralized user management.

**Key Features:**
*   **Scouting:** Match, Pit, and Alliance scouting with 2025 game support (Coral/Algae).
*   **Data Analysis:** Interactive dashboards, team comparisons, and field maps.
*   **Authentication:** Google OAuth integration with a 5-tier role system (Pending -> Scout -> Lead -> Admin -> Ultra Admin).
*   **Offline First:** Uses Dexie (IndexedDB) for local storage with robust synchronization capabilities.
*   **PWA:** Fully functional Progressive Web App with service worker caching.

## Architecture

*   **Frontend:** React 19 + TypeScript, built with Vite. UI components use Tailwind CSS and shadcn/ui.
*   **Backend:** Node.js + Express server (`server/`) handling role management and authentication state. Uses SQLite (`server/database.sqlite`) via Prisma.
*   **Database (Client):** `src/lib/dexieDB.ts` is the authoritative source for scouting data (matches, teams, pit data).
*   **Database (Server):** SQLite is used solely for user roles and permissions.

## Getting Started

### Prerequisites
*   Node.js (v16+)
*   npm or yarn

### Installation
```bash
npm install
cd server && npm install && cd ..
```

### Environment Configuration
Create a `.env` file in the root directory (see `.env.example`):
```env
VITE_GOOGLE_CLIENT_ID=your-client-id
VITE_GOOGLE_ADMIN_EMAIL=admin@example.com
VITE_API_BASE_URL=http://localhost:3001
```

## Development Workflows

### Running the Application
1.  **Start the Backend:**
    ```bash
    cd server
    npm run dev  # Runs on http://localhost:3001
    ```
2.  **Start the Frontend:**
    ```bash
    npm run dev  # Runs on http://localhost:5173
    ```

### Building for Production
```bash
npm run build
```
This command compiles TypeScript, builds the Vite assets, and restarts the PM2 process (`1676-scouting`).

### Docker
To run the backend API via Docker:
```bash
docker-compose up --build
```

## Key Files & Directories

*   `src/` - Frontend source code.
    *   `components/` - Reusable UI components.
    *   `pages/` - Application routes.
    *   `contexts/AuthContext.tsx` - Handles Google OAuth and RBAC logic.
    *   `lib/dexieDB.ts` - Client-side database schema and operations.
*   `server/` - Backend API source code.
    *   `src/server.js` - Express application entry point.
    *   `src/routes/roles.js` - API endpoints for role management.
*   `public/` - Static assets.
*   `scripts/` - Utility scripts (e.g., compression testing).

## Conventions

*   **Style:** TypeScript + React hooks. Use Functional Components.
*   **State Management:** React Context (`AuthContext`) + Local State.
*   **Styling:** Tailwind CSS utility classes.
*   **Imports:** Use path aliases (e.g., `@/components/...`) where possible.

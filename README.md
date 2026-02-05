# Maneuver - Advanced FRC Scouting Application

Repository: https://github.com/PioneersTeam1676/1676-maneuver (main) — maintained by PioneersTeam1676.

A comprehensive, mobile-first scouting application for FIRST Robotics Competition (FRC) teams. Maneuver provides powerful tools for match scouting, team analysis, pit scouting, alliance selection, and data management.

## ✨ What Makes This Version Different

This fork introduces **enterprise-grade authentication and admin controls** while preserving the original Maneuver's robust scouting features. Key improvements include:

### � Google OAuth Authentication & Role-Based Access Control
- **Seamless Google Sign-In**: Integrated Google Identity Services for secure authentication
- **Role Hierarchy**: Five-tier permission system (Pending → Scout → Lead → Admin → Ultra Admin)
- **Verification Center**: Leads can review and approve external sign-ins from non-alliance domains
- **Admin Panel**: Comprehensive interface for managing team permissions and reviewing access requests
- **Alliance Confirmations**: Custom form for scouts outside the primary domain to verify their team affiliation
- **Ultra Admin Protection**: Environment-configured super-admin accounts that cannot be demoted or removed

### 🎯 Enhanced User Experience
- **Smart PWA Updates**: Manual update prompts instead of forced refreshes—users control when to apply updates
- **Visual Status Indicators**: Check/X icons throughout admin interfaces for quick verification status scanning
- **Persistent Scout Profiles**: Google account integration ensures scout achievements and stats follow them across devices
- **Real-time Sync**: Recent user activity tracking with acknowledgment workflows

### 🛡️ Security & Data Management
- **Backend API**: Express.js server with SQLite for centralized role storage and user management
- **Environment-Based Config**: Flexible domain whitelisting and admin designation via environment variables
- **Audit Trail**: First-seen/last-seen timestamps and acknowledgment flags for compliance and monitoring

### 🎨 Modern UI Refinements
- **Verification Status Components**: Reusable check/X badge system for approval states
- **Navigation Enhancements**: Ultra Admin badge in sidebar, role-aware menu visibility
- **Status Bar Theming**: iOS Safari status bar color follows app theme (light/dark mode)
- **Improved Accessibility**: ARIA labels and semantic HTML throughout authentication flows

## �🚀 Core Scouting Features


- **Comprehensive Data Collection**: Track autonomous, teleop, and endgame performance with real-time input
- **Interactive Field Maps**: Visual interfaces for starting positions and strategy
- **2025 Game Support**: Coral scoring (4 levels), algae management, climb analysis
- **Match Strategy Integration**: Import match data from The Blue Alliance API and Nexus
- **Field Canvas**: Draw and annotate match strategies, auto-fill by match number

- **Multi-Tab Dashboard**: Detailed performance metrics across Overall, Auto, Teleop, and Endgame phases
- **Advanced Analytics**: Strategy overview with filtering, sorting, charts, and multiple aggregation types
- **Team Comparisons**: Side-by-side analysis with visual indicators and statistical significance
- **Position Analysis**: Field maps showing starting position preferences and success rates
- **Alliance Selection**: Drag-and-drop pick lists, desktop/mobile layouts, alliance initializer, and selection tables


### 🏆 Scout Profiles & Achievements
- **Persistent Scout Profiles**: Stake tracking, prediction scoring, and achievement system
- **Achievements**: Unlockable badges and progress tracking for scouts

### 🏗️ Pit Scouting & Assignments
- **Full Pit Scouting UI**: Forms for robot specs, photos, auto/teleop/endgame, technical notes
- **Pit Assignment Tools**: Assignment controls, event configuration, pit map visualization, spatial clustering

### 📱 Data Management & Transfer
- **Flexible Transfer**: JSON files and fountain codes for large datasets
- **Local Storage**: Persistent data with merge/overwrite capabilities (IndexedDB via Dexie)

### 🛠️ Technology Stack

- **Frontend**: React 19 with TypeScript
- **Build Tool**: Vite (dev server + build)
- **UI Framework**: Tailwind CSS with shadcn/ui primitives
- **Local DB**: Dexie (IndexedDB) — `src/lib/dexieDB.ts` is authoritative
- **Data Transfer**: Luby Transform fountain codes (QR), JSON import/export
- **PWA**: vite-plugin-pwa with service worker runtime caching
- **Analytics**: Google Analytics 4 (lightweight wrapper at `src/lib/analytics`)

```

## 🚀 Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm (preferred) or yarn

### First-Time Setup

1. **Clone and Install**:
   ```bash
   git clone <repository-url>
   cd maneuver
   npm install
   ```

2. **Configure Environment Variables**:
   Create a `.env` file in the root directory:
   ```bash
   # Google OAuth (required for authentication)
   VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
   
   # Admin Configuration
   VITE_GOOGLE_ADMIN_EMAIL=your-admin@example.com
   VITE_ALLOWED_ALLIANCE_DOMAIN=yourteam.org
   VITE_ALLOWED_ALLIANCE_DOMAINS=yourteam.org,partner1.org,partner2.org

   # API base (comma-separated fallbacks allowed)
   VITE_API_BASE_URL=https://api.team1676.org/scouting
   
   # Push Notifications (frontend)
   # Public VAPID key used by the browser to subscribe for push
   VITE_VAPID_PUBLIC_KEY=your-public-vapid-key
   # How many matches before a scout's shift to notify (UI copy)
   VITE_MATCH_NOTIFICATION_LOOKAHEAD=3

   # Form Maker defaults (shared by frontend + backend)
   # Only host is defaulted; name/user/pass are per-form fields.
   VITE_FORM_DB_HOST=your-db-host

   # Optional: Analytics
   VITE_GA_MEASUREMENT_ID=G-XXXXXXXXXX
   ```

3. **Start Backend Server** (for role management):
   ```bash
   cd server
   npm install
   npm start
   # Server runs on http://localhost:3001
   ```

4. **Start Frontend**:
   ```bash
   npm run dev
   # App runs on http://localhost:4175
   ```

### Production Build & Deployment

This version includes PM2 integration for production deployments:

```bash
npm run build  # Compiles TypeScript, builds with Vite, restarts PM2 process
```

The build automatically:
- Type-checks all TypeScript files
- Bundles assets with Vite
- Generates PWA service worker
- Restarts the production server (PM2 process `1676-scouting`)

### Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable **Google Identity Services** API
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized JavaScript origins:
   - `http://localhost:4175` (development)
   - Your production domain (e.g., `https://scouting.team1676.org`)
6. Copy the Client ID to your `.env` file

## 📖 Usage

### Quick Start

1. **Demo Data**: Click "Load Demo Data" on homepage to explore all features
2. **Core Workflows**: Match scouting → Team analysis → Strategy planning → Alliance selection
3. **Data Transfer**: Use QR codes or JSON files to share data between devices

### Key Workflows

**Authentication & Access Control**: 
- Sign in with Google → Admin approves external accounts → Leads verify team affiliation → Role-based feature access

**Match Scouting**: 
- Game Start → Auto Phase → Teleop → Endgame → Submit

**Team Analysis**: 
- Select team → View multi-tab statistics → Compare with others → Analyze positions

**Strategy Planning**: 
- Dashboard overview → Interactive charts → Column configuration → Event filtering

**Alliance Selection**: 
- Create pick lists → Research teams → Drag-and-drop ordering → Export/share

**Pit Scouting**: 
- Assign scouts → Fill out pit forms → Visualize pit map → Export pit data

**Admin Management**:
- Review pending sign-ins → Approve alliance requests → Assign roles → Monitor user activity

**Achievements**: 
- Track scout progress, unlock badges, and view leaderboard

### Push Notifications & Match Reminders

This build supports push notifications to remind scouts before their next assignment.

- Where it lives:
   - UI/modal and subscription: `src/components/MatchReminderToggle.tsx`
   - Background auto-prompt (no card UI): mounted in `src/layouts/MainLayout.tsx`
- iOS requirements:
   - iOS 16.4+; install the app to Home Screen; open from the Home Screen icon
   - The permission modal guides users if the browser reports limited support
- Configurable lead time:
   - Frontend copy: `VITE_MATCH_NOTIFICATION_LOOKAHEAD` (e.g., 3)
   - Backend scheduler: `MATCH_NOTIFICATION_LOOKAHEAD` (same value recommended)

Server-side environment (set via Docker or your process manager):

- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (required)
- `VAPID_CONTACT_EMAIL` (required)
- `MATCH_NOTIFICATION_LOOKAHEAD` (optional; defaults to 5 if unset)

Frontend environment (in `.env`):

- `VITE_VAPID_PUBLIC_KEY` (must match server public key)
- `VITE_MATCH_NOTIFICATION_LOOKAHEAD`

## 🏗️ Project Structure

```
src/
├── components/          # Reusable UI components
│   ├── AutoComponents/     # Autonomous phase components
│   ├── DashboardComponents/ # Main dashboard elements (including nav-user with role badges)
│   ├── DataTransferComponents/ # Import/export functionality
│   ├── TeamStatsComponents/ # Team analysis tools
│   ├── StrategyComponents/ # Strategy overview and analysis
│   ├── PickListComponents/ # Alliance selection tools
│   ├── MatchStrategyComponents/ # Match planning tools
│   ├── PitScoutingComponents/ # Pit scouting forms and displays
│   ├── PitAssignmentComponents/ # Pit assignment and mapping
│   └── ui/                # Base UI components (shadcn/ui + verification-status)
├── pages/              # Application pages/routes
│   ├── AdminPanelPage.tsx       # Comprehensive admin controls
│   ├── VerificationCenterPage.tsx # Lead-level approval interface
│   └── AllianceConfirmationPage.tsx # External scout verification form
├── contexts/           # React Context providers
│   └── AuthContext.tsx # Google OAuth, role management, user state
├── lib/                # Utility functions and helpers
│   ├── dexieDB.ts      # IndexedDB schema and database operations
│   ├── analytics.ts    # Google Analytics wrapper
│   └── haptics.ts      # Mobile haptic feedback
├── hooks/              # Custom React hooks
│   ├── useScoutingSession.ts
│   ├── useTeamStatistics.ts
│   └── usePWA.ts       # PWA update detection
├── assets/             # Images and static files
└── layouts/            # Page layout components

server/                 # Backend API (NEW in this version)
├── src/
│   ├── routes/
│   │   └── roles.js    # Role management endpoints
│   └── server.js       # Express app with SQLite
└── database.sqlite     # Persistent role storage
```

## 🔧 Architecture & Developer Notes

- **Database is authoritative**: Most app state and exports/imports flow through `src/lib/dexieDB.ts` (`db`, `pitDB`, `gameDB`).
- **Authentication Flow**: `AuthContext` wraps the app, manages Google OAuth, syncs roles with backend API, and provides role checks (`isAdmin`, `isLead`, etc.) to all components.
- **Backend API**: Express server (`server/src/server.js`) handles role CRUD operations with SQLite persistence. Roles include `ultra_admin`, `admin`, `lead`, `scout`, and `pending`.
- **Role Protection**: Ultra admin accounts (configured via `VITE_GOOGLE_ADMIN_EMAIL`) cannot be demoted or removed through the UI.
- **PWA Strategy**: Service worker uses `NetworkFirst` caching; updates are detected but not auto-applied—users see a prompt and choose when to refresh.
- **Environment Variables**: All config lives in `.env` files; never commit credentials or client secrets to version control.
- **Verification History**: Each time a user moves from pending to any other role, the API records the event in `verified_users` with a timestamp so the last seven days of approvals can be queried server-side.

### Mobile UX Notes
- Minimum 44px touch targets across interactive elements
- Inputs use 16px font on mobile to avoid iOS zoom-on-focus
- Bottom navigation uses safe-area insets and a subtle glass/blur effect
- Dialogs and cards have tighter mobile spacing and improved readability

### Key Files for Authentication Features
- `src/contexts/AuthContext.tsx` - Central auth state, Google OAuth integration, role management
- `src/pages/VerificationCenterPage.tsx` - Lead approval interface for external sign-ins
- `src/pages/AdminPanelPage.tsx` - Admin controls for role assignment and user management
- `src/components/ui/verification-status.tsx` - Reusable check/X status indicator
- `server/src/routes/roles.js` - Backend API for role persistence

## 🤝 Contributing

We welcome contributions to Maneuver! Here's how you can help:

---

1. **Fork the repository**
2. **Create a feature branch**: `git checkout -b feature/amazing-feature`
3. **Make your changes**: Follow the existing code style and patterns
4. **Test thoroughly**: Ensure all features work as expected
5. **Submit a pull request**: Describe your changes and their benefits
### Development Guidelines
- Use TypeScript for type safety
- Follow React best practices and hooks patterns
- Maintain responsive design for mobile compatibility
- Test data transfer features thoroughly
- Document any new features or changes

### PR checklist
- Run typecheck: `npm run build` and fix errors.
- Run linter: `npm run lint` and fix issues.
- Smoke test: `npm run dev` → verify affected pages; if DB touched, confirm migration helpers/backups work.

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **FIRST Robotics Competition** for inspiring this project
- **VihaanChhabria** and the [VScout project](https://github.com/VihaanChhabria/VScout) for providing the initial foundation and inspiration for this application
- **Original Maneuver Contributors** for building the robust core scouting platform that this fork extends
- **The Blue Alliance** for providing match data APIs
- **Google Identity Services** for secure authentication infrastructure
- **shadcn/ui** for the excellent component library
- **Luby Transform** library for robust data transfer capabilities

## 🆚 Comparison with Original Maneuver

| Feature | Original Maneuver | This Version |
|---------|------------------|--------------|
| **Authentication** | None (open access) | Google OAuth with role-based access control |
| **User Management** | Not applicable | Admin panel, verification center, role hierarchy |
| **Access Control** | Everyone has full access | Five-tier permission system (pending → ultra admin) |
| **Multi-Team Support** | Single team/domain | Alliance domain whitelisting, external scout verification |
| **PWA Updates** | Auto-refresh on update | User-controlled update prompts |
| **Scout Profiles** | Device-local only | Google account-linked, persistent across devices |
| **Admin Tools** | None | Comprehensive admin panel, pending approval workflows |
| **Backend** | Frontend-only | Express + SQLite for centralized role management |
| **Audit Trail** | None | First-seen, last-seen, acknowledgment tracking |

**When to use this version**: Teams needing multi-user access control, alliance scouting coordination, or centralized permission management.

**When to use original Maneuver**: Single-team deployments where all scouts have equal access and no authentication is required.

## 📞 Support

For questions, issues, or feature requests:
- Open an issue on GitHub
- Contact the development team
- Check the documentation and demo data for examples

### Common Setup Issues

**"Google sign-in not working"**: 
- Verify `VITE_GOOGLE_CLIENT_ID` is set correctly in `.env`
- Check that your domain is authorized in Google Cloud Console
- Ensure the backend server is running on port 3001

**"Still showing as pending after admin approval"**: 
- Hard refresh the browser (Ctrl+Shift+R / Cmd+Shift+R)
- Check that the backend API is accessible and role was saved
- Verify email normalization (all lowercase, trimmed)

**"Can't access admin panel"**: 
- Confirm your email is set as `VITE_GOOGLE_ADMIN_EMAIL` 
- Rebuild and restart: `npm run build`
- Check AuthContext console logs for role assignment

## 🐳 Docker Deployment

- Start services without losing data:
   ```bash
   docker compose up -d --build
   ```
- The API stores its SQLite database inside the container at `/data`. By default this is bound to `./server/data` on the host. To keep data outside the repo (or reuse an existing named volume), set `DATA_VOLUME_HOST_PATH` when launching:
   ```bash
   DATA_VOLUME_HOST_PATH=/absolute/path/to/maneuver-data docker compose up -d
   # or use a Docker volume name
   DATA_VOLUME_HOST_PATH=maneuver_db docker compose up -d
   ```
- To restart the stack without touching persisted data, prefer `docker compose restart` or `docker compose stop` / `docker compose up -d` instead of `docker compose down -v` (the `-v` flag deletes volumes).

---

## 🗒️ Changelog

### 2025-10-29
- Push notifications and match reminders:
   - Added subscription UI with permission modal and iOS guidance
   - Background auto-prompt runs silently when applicable
   - New env vars: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_CONTACT_EMAIL`, `MATCH_NOTIFICATION_LOOKAHEAD`, `VITE_VAPID_PUBLIC_KEY`, `VITE_MATCH_NOTIFICATION_LOOKAHEAD`
- Mobile UX overhaul:
   - 44px minimum touch targets, 16px input font on mobile
   - Refined bottom navigation with blur/safe-area support
   - Improved spacing/typography across dialogs, forms, and tabs
- Defaults & cleanup:
   - Admin notification URL default set to `/` (instead of `/home`)
   - Removed development-only status/debug footer

**Built with ❤️ for the FRC community**

*This enhanced version of Maneuver adds enterprise-grade authentication and admin controls, enabling teams to coordinate multi-device scouting operations with confidence and security.*

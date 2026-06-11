# LDPL CMMS — Computerized Maintenance Management System

Replacement for legacy MP2 CMMS at **Liberty Daharki Powers Ltd** (235 MW Power Plant, Daharki).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Desktop | Electron.js — **primary client** (Windows workstations) |
| Frontend UI | React 19 + TypeScript + Tailwind CSS (embedded in Electron) |
| Backend | Node.js + Express REST API |
| Database | PostgreSQL 16 + Prisma ORM |
| Auth | JWT + bcrypt (cost factor 12) |
| Real-time | Socket.io |

## Project Structure

```
packages/
  server/    — Node.js API + Prisma
  client/    — React UI (embedded in Electron desktop app)
  desktop/   — Electron shell for Windows workstations
```

## Prerequisites

- Node.js 20+
- PostgreSQL 14+ (local or LAN server)

## Quick Start (Ubuntu Dev)

### 1. Install dependencies

```bash
cd "/home/kashif/Desktop/LIBERTY Tool MGT"
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit DATABASE_URL if needed
```

### 3. Create PostgreSQL database

Database name: **`ldpl_cmms_db`** (already created on your machine)

```bash
# If setting up fresh on another machine:
sudo -u postgres psql -c "CREATE DATABASE ldpl_cmms_db OWNER kashif;"
```

### 4. Run migrations and seed

```bash
npm run db:setup
```

### 5. Start the desktop application

```bash
# Development — opens Electron window (API + UI bundled in desktop shell)
npm run dev

# Production — after build, run API + desktop app
npm run build
npm run start
```

The app runs **only as a desktop application** (Electron). Do not open a browser manually.

- **API health (server):** http://localhost:3001/api/health
- **Desktop app:** Launches automatically via Electron

### Workstation deployment (Windows)

```bash
npm run package:win -w @ldpl/cmms-desktop
```

Install the `.exe` from `packages/desktop/out/`. On first login, use **Configure API server address** to point to the LAN server (e.g. `http://192.168.1.100:3001`).

### Default Login

| Username | Password | Role |
|----------|----------|------|
| admin | Admin@123 | System Administrator |
| manager | Admin@123 | Plant Manager |
| engineer | Admin@123 | Maintenance Engineer |
| supervisor | Admin@123 | Supervisor |
| storekeeper | Admin@123 | Storekeeper |
| technician | Admin@123 | Technician |

## Production Deployment

**Full rollout guide:** [DEPLOYMENT.md](./DEPLOYMENT.md)  
**Release summary:** [RELEASE.md](./RELEASE.md)

### Server PC (one machine, always on)

```bash
cp .env.example .env          # edit DATABASE_URL, JWT secrets, NODE_ENV=production
bash scripts/setup-server.sh  # first time only
bash scripts/start-server.sh  # start API (note the LAN IP printed in console)
```

Windows: use `scripts\setup-server.bat` and `scripts\start-server.bat`.

### Workstation PCs (desktop app only)

```bash
npm run build:release
npm run package:win      # Windows — build on Windows for best results
npm run package:linux    # Linux AppImage
```

Installer output: `packages/desktop/out/`  
See `packages/desktop/out/README-INSTALL.txt` for distribution steps.

Each workstation: install app → **Configure API server address** → `http://<SERVER_IP>:3001`

### Build everything

```bash
npm run build:release
```

## Windows Deployment

### Server PC (LAN)

1. Install PostgreSQL 16 and Node.js 20 LTS on the dedicated server PC
2. Clone/copy project, configure `.env` with server LAN IP
3. Run `npm run db:setup && npm run build`
4. Start API as Windows Service (or PM2): `npm run start -w @ldpl/cmms-server`
5. Configure nightly backup cron:
   ```bash
   # Linux — run at 2 AM daily
   0 2 * * * cd /path/to/LDPL-CMMS && npm run backup
   ```
   Set `BACKUP_ENCRYPTION_KEY` in `.env` for AES-256 encrypted backups. Copy `backups/` to external HDD.

### Workstation PCs

1. Build Windows installer: `npm run package:win -w @ldpl/cmms-desktop`
2. Install `.exe` from `packages/desktop/out/`
3. Configure server URL to LAN IP (e.g. `http://192.168.1.100:3001`)

## Development Phases

| Phase | Status | Modules |
|-------|--------|---------|
| **Phase 1** | ✅ Complete | Auth, User Management, DB Schema, Electron Shell |
| **Phase 2** | ✅ Complete | Equipment Registry, Barcode |
| **Phase 3** | ✅ Complete | Work Orders — lifecycle, labor, approvals |
| **Phase 4** | ✅ Complete | PM Scheduling — templates, auto-WO generation |
| **Phase 5** | ✅ Complete | Inventory — spare parts, transactions, alerts |
| **Phase 6** | ✅ Complete | Purchasing — PR, PO, GRN, vendors |
| **Phase 7** | ✅ Complete | Reports & Analytics — KPIs, MTTR/MTBF, export |
| **Phase 8** | ✅ Complete | Security hardening, nightly backups, system config |
| **Phase 9** | ✅ Complete | API tests, smoke tests, user training guides |

## Testing

```bash
# Unit + integration tests (requires PostgreSQL with seeded data)
npm test

# Smoke test against running server
npm run dev   # in one terminal
npm run smoke-test   # in another
```

## User Training

In-app guides are available at **Help & Training** in the sidebar — role-specific workflows for all modules.

## License

Confidential — Internal Use Only — Liberty Daharki Powers Ltd

# LDPL CMMS — Deployment Guide

**Liberty Daharki Powers Ltd — Multi-User Desktop Deployment**

This guide covers rolling out LDPL CMMS across the plant: one **server PC** (database + API) and multiple **workstation PCs** (desktop app).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  SERVER PC (always on)                                       │
│  PostgreSQL 16  +  Node.js API  :3001                       │
│  Nightly backups · PM cron · file uploads                      │
└───────────────────────────┬─────────────────────────────────┘
                            │  LAN (same network)
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
   Workstation 1       Workstation 2       Workstation N
   LDPL CMMS.exe       LDPL CMMS.exe       LDPL CMMS.exe
   (Electron)          (Electron)          (Electron)
```

All users share the **same database** via the central API. Each workstation runs the desktop app only — no browser, no local database.

---

## Part 1 — Server PC Setup

### Requirements

| Item | Version |
|------|---------|
| OS | Windows Server / Windows 10+ or Ubuntu 22.04+ |
| Node.js | 20 LTS |
| PostgreSQL | 14+ (16 recommended) |
| RAM | 4 GB minimum |
| Disk | 20 GB + space for backups |

### Step 1: Install PostgreSQL

**Windows:** Install PostgreSQL 16 from [postgresql.org](https://www.postgresql.org/download/windows/).

**Linux:**
```bash
sudo apt update && sudo apt install -y postgresql postgresql-contrib
```

Create database and user:
```sql
CREATE USER cmms_user WITH PASSWORD 'your_secure_password';
CREATE DATABASE ldpl_cmms_db OWNER cmms_user;
GRANT ALL PRIVILEGES ON DATABASE ldpl_cmms_db TO cmms_user;
```

### Step 2: Copy project to server

Copy the full project folder to the server, e.g.:
- Windows: `C:\LDPL-CMMS`
- Linux: `/opt/ldpl-cmms`

### Step 3: Configure environment

```bash
cp .env.example .env
```

Edit `.env`:

| Variable | Example | Notes |
|----------|---------|-------|
| `DATABASE_URL` | `postgresql://cmms_user:pass@localhost:5432/ldpl_cmms_db?schema=public` | Server DB connection |
| `HOST` | `0.0.0.0` | Listen on all interfaces for LAN |
| `PORT` | `3001` | API port (open in firewall) |
| `NODE_ENV` | `production` | Required for security checks |
| `JWT_SECRET` | *(64+ char random)* | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | *(different random)* | Must differ from JWT_SECRET |
| `BACKUP_ENCRYPTION_KEY` | *(optional)* | Enables encrypted nightly backups |

### Step 4: Run setup

**Linux:**
```bash
chmod +x scripts/*.sh
bash scripts/setup-server.sh
```

**Windows (Command Prompt as Administrator):**
```cmd
scripts\setup-server.bat
```

### Step 5: Start the API server

**Linux:**
```bash
bash scripts/start-server.sh
```

**Windows:**
```cmd
scripts\start-server.bat
```

On startup, the console prints **LAN addresses** workstations should use, e.g.:
```
Workstations should connect to:
  → http://192.168.1.100:3001
```

**Write down this IP** — every desktop client needs it.

### Step 6: Verify server

```bash
curl http://localhost:3001/api/health
```

Expected: `{"status":"ok","app":"LDPL CMMS API",...}`

From another PC on the LAN:
```bash
curl http://192.168.1.100:3001/api/health
```

### Step 7: Firewall

Allow inbound **TCP port 3001** on the server PC:

**Windows:** Windows Defender Firewall → Inbound Rules → New Rule → Port 3001 TCP

**Linux:**
```bash
sudo ufw allow 3001/tcp
```

### Step 8: Run as a service (recommended)

**Linux (systemd):**
```bash
sudo useradd -r -s /bin/false cmms || true
sudo chown -R cmms:cmms /opt/ldpl-cmms
sudo cp deploy/ldpl-cmms-server.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now ldpl-cmms-server
sudo systemctl status ldpl-cmms-server
```

**Windows:** Use [NSSM](https://nssm.cc/) or Task Scheduler to run `scripts\start-server.bat` at startup.

### Step 9: Nightly backups

**Linux cron (2 AM daily):**
```cron
0 2 * * * cd /opt/ldpl-cmms && npm run backup >> /var/log/ldpl-cmms-backup.log 2>&1
```

Copy the `backups/` folder to an external drive weekly.

---

## Part 2 — Workstation Desktop App

Workstations **do not** need Node.js or PostgreSQL. They only need the LDPL CMMS desktop installer.

### Build the installer (on a dev/build machine)

```bash
npm install
npm run build:release

# Windows installer (build on Windows for best results)
npm run package:win

# Linux AppImage (for dev/testing on Ubuntu)
npm run package:linux
```

Output location: `packages/desktop/out/`

| Platform | File |
|----------|------|
| Windows | `LDPL CMMS Setup 1.0.0.exe` |
| Linux | `LDPL CMMS-1.0.0.AppImage` |

Distribute the installer to each workstation via USB, shared drive, or IT deployment tool.

### Install on each workstation

1. Run the installer (`.exe` or `.AppImage`)
2. Launch **LDPL CMMS** from the desktop shortcut
3. On the login screen, click **Configure API server address**
4. Enter: `http://192.168.1.100:3001` (replace with your server LAN IP)
5. Click **Save**, then sign in

### Default login (change passwords after rollout)

| Username | Password | Role |
|----------|----------|------|
| admin | Admin@123 | System Administrator |
| manager | Admin@123 | Plant Manager |
| engineer | Admin@123 | Maintenance Engineer |
| supervisor | Admin@123 | Supervisor |
| storekeeper | Admin@123 | Storekeeper |
| technician | Admin@123 | Technician |

**Important:** Log in as `admin` → **Settings** → change all default passwords before go-live.

---

## Part 3 — Go-Live Checklist

- [ ] Server API responds at `http://<SERVER_IP>:3001/api/health` from a workstation
- [ ] Firewall allows port 3001 on server
- [ ] JWT secrets changed in production `.env`
- [ ] Default user passwords changed
- [ ] Desktop app installed on all workstations
- [ ] Each workstation configured with correct server URL
- [ ] Smoke test passes: `API_URL=http://192.168.1.100:3001 npm run smoke-test`
- [ ] Nightly backup cron configured
- [ ] IT contact documented for server restarts

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Desktop app shows "Login failed" / network error | Check server URL, firewall, and that API is running |
| Cannot connect from workstation | Ping server IP; test `curl http://IP:3001/api/health` |
| "JWT secrets must be changed" on server start | Set `NODE_ENV=production` and update JWT secrets in `.env` |
| Database connection error | Verify PostgreSQL is running and `DATABASE_URL` is correct |
| Port 3001 already in use | Stop other process or change `PORT` in `.env` |
| PM work orders not generating | Ensure server has been running continuously (cron runs at midnight) |

---

## Updating the application

**Server (API only):**
1. Stop the service
2. Pull/copy new code
3. `npm install && npm run build -w @ldpl/cmms-server`
4. `npm run db:migrate:deploy`
5. Restart the service

**Workstations:** Install the new desktop `.exe` over the old version. Server URL is preserved.

---

## Support

In-app **Help & Training** (sidebar) contains role-specific guides for all modules.

**License:** Confidential — Internal Use Only — Liberty Daharki Powers Ltd

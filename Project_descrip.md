# LDPL CMMS — Project Description & Context Document

**For:** Proposal / presentation context  
**Client:** Liberty Daharki Powers Ltd (LDPL)  
**Location:** 235 MW Power Plant, Daharki, Ghotki, Sindh, Pakistan  
**Version:** 1.0 — Production Ready (June 2026)  
**Classification:** Confidential — Internal Use Only

---

## 1. Executive Summary

**LDPL CMMS** is a custom **Computerized Maintenance Management System** built to **replace the legacy MP2 CMMS** (Datastream / Infor — discontinued). It modernizes plant maintenance operations with a web/desktop application, centralized PostgreSQL database, role-based access, full audit trails, and integrated workflows from equipment registry through purchasing and analytics.

The system runs on **Liberty’s internal LAN** — no internet dependency for daily operations. It shares the same technology stack as the **LDPL Operations Portal** (Electron + React + Node.js + PostgreSQL), enabling future integration and single sign-on.

**Current status:** All **9 development phases complete**. Core CMMS is **operational and production-ready** for deployment at Daharki plant.

---

## 2. Business Problem & Goals

### Problem
- MP2 is obsolete, poor UI/UX, no modern network access, no integration with current workflows
- Maintenance, stores, and management lack unified digital workflows
- No modern KPI reporting (MTTR, MTBF, PM compliance, cost tracking)

### Project Goals
| Goal | Status |
|------|--------|
| Replace MP2 completely | ✅ Core modules delivered |
| LAN-only, internally owned | ✅ Architecture designed & built |
| Role-based access (8 roles) | ✅ Implemented |
| Centralized PostgreSQL on server PC | ✅ Implemented |
| Modern UI (React + Electron) | ✅ Implemented |
| Full audit trails | ✅ Implemented |
| Excel/PDF exportable reports | ✅ CSV + print-to-PDF |
| Automated PM scheduling | ✅ Daily cron + auto-WO generation |
| Procurement workflow (PR → PO → GRN) | ✅ Implemented |
| Security & nightly backups | ✅ Implemented |

---

## 3. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Workstation PCs (Windows)                                   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ LDPL CMMS Desktop App (Electron)                      │   │
│  │ Connects to LAN API server — no browser required      │   │
│  └──────────────────────────┬───────────────────────────┘   │
│                      │ HTTP / WebSocket                     │
└──────────────────────┼──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Server PC (LAN — e.g. 192.168.1.100)                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ Node.js + Express REST API  (port 3001)              │   │
│  │ Socket.io (real-time notifications)                  │   │
│  │ Prisma ORM → PostgreSQL 16 (ldpl_cmms_db)            │   │
│  │ /uploads (attachments)  |  /backups (nightly dumps)  │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| Desktop shell | Electron.js — **only client** (Windows workstations; Linux for dev) |
| Frontend UI | React 19, TypeScript, Tailwind CSS — embedded in Electron |
| Backend | Node.js 20+, Express 5 REST API |
| Database | PostgreSQL 16, Prisma ORM (~23 tables) |
| Auth | JWT (8h expiry) + bcrypt (cost 12) + refresh token rotation |
| Real-time | Socket.io |
| Barcode | jsBarcode |
| Monorepo | npm workspaces (`server`, `client`, `desktop`) |

### Repository Structure

```
LIBERTY Tool MGT/
├── packages/
│   ├── server/     — Express API, Prisma schema, seed, tests
│   ├── client/     — React SPA (Vite)
│   └── desktop/    — Electron shell for Windows workstations
├── scripts/        — backup-db.sh, restore-db.sh, smoke-test.mjs
├── .env            — DATABASE_URL, JWT secrets, BACKUP_DIR, etc.
└── README.md
```

---

## 4. User Roles & Access Control

| Role | Code | Primary Users | Key Permissions |
|------|------|---------------|-----------------|
| System Administrator | admin | IT Department | Full access, users, system config, backups |
| Plant Manager / GM | manager | GM, Deputy Manager | Approve WOs/POs, all reports, read-all |
| Maintenance Engineer | engineer | Maintenance engineers | Create WOs/assets, PRs, approve WOs |
| Supervisor | supervisor | Shift supervisors | Assign WOs, approve PRs/WOs |
| Storekeeper | storekeeper | Stores department | Inventory, PR/PO/GRN, vendors |
| Technician | technician | Maintenance technicians | Assigned WOs, log labor |
| Viewer / Auditor | viewer | Management, auditors | Read-only + export reports |
| HOD (Dept Head) | hod | Department heads | Approve purchase requisitions |

Permissions enforced **server-side** on every API endpoint via middleware and role checks.

---

## 5. Modules Delivered (Functional Scope)

### 5.1 Equipment & Asset Registry ✅
- 5-level hierarchy: Plant → System → Sub-System → Equipment → Component
- Asset tag numbers (LDPL-XXXXX), categories, criticality, location, warranty
- Barcode label generation and tag lookup
- Transfer between departments, decommission workflow
- Sample seeded assets: LDPL-00001 through LDPL-00005

### 5.2 Work Order Management ✅
- Types: CM, PM, PdM, INS, MOD, SDW
- Priorities: critical, high, medium, low
- Full lifecycle: Open → Assigned → In Progress → On Hold → Pending Approval → Completed / Cancelled
- Assignment, labor logging, parts issue (links to inventory), cost calculation
- Supervisor/manager approval workflow
- Sample WOs: WO-2026-00001 (CM, in progress), WO-2026-00002 (PM, open)

### 5.3 Preventive Maintenance Scheduling ✅
- PM templates with frequency (daily/weekly/monthly/quarterly/annually/by hours/by km)
- Task checklists per template
- **Daily cron scheduler** auto-generates PM work orders when due
- PM forecast report (next 90 days)
- 2 seeded templates: Monthly Motor inspection, Quarterly Cooling Tower

### 5.4 Inventory & Spare Parts ✅
- Item master: codes (ITM-XXXXX), stock levels, min/max, reorder points, barcodes
- Transactions: receipt, issue to WO, return, adjustment, scrap, transfer
- Low stock & critical-zero alerts
- Issue to WO auto-creates `wo_part` and recalculates WO cost
- 4 seeded items (ITM-00001 to ITM-00004), 2 vendors (SKF, Siemens)

### 5.5 Purchasing & Procurement ✅
- **Workflow:** PR → HOD/Supervisor approve → PO → Manager approve → Order → GRN → auto stock update
- Vendor registry with ratings, blacklist flag
- Purchase requisitions with line items
- Purchase orders with line items
- Goods Received Note (GRN) triggers inventory receipt
- Sample PR: PR-2026-00001 (submitted)

### 5.6 Reports & Analytics ✅
- **KPI Dashboard:** open WOs by priority/type, completion rate, MTTR by category, MTBF by asset, PM compliance, maintenance cost, inventory value, pending PO value, overdue WOs, top maintained assets
- **Standard reports (10):** WO history, PM compliance, maintenance cost, inventory valuation, stock movement, purchase orders, labor hours, audit trail, warranty expiry, PM forecast
- Export: Excel-compatible CSV + print-to-PDF

### 5.7 Security & System Administration ✅
- bcrypt password hashing, JWT 8h sessions, refresh token rotation
- Login lockout: 5 failed attempts → 15 min lock
- API rate limiting, security headers, Zod input validation
- Prisma parameterized queries (SQL injection protection)
- **Nightly database backup** (pg_dump, optional AES-256 encryption)
- Admin settings UI: security status, backup management, system config
- Audit log on all critical actions

### 5.8 User Management ✅
- CRUD users (admin only), 8 departments seeded
- Demo users for all roles (password: Admin@123)

### 5.9 Help & Training ✅
- In-app **Help & Training** page with role-specific guides, daily workflows, FAQ

---

## 6. Database Schema (PostgreSQL)

**Database name:** `ldpl_cmms_db`  
**ORM:** Prisma with UUID primary keys, soft deletes (`deleted_at`)

| Table | Purpose |
|-------|---------|
| users, departments, refresh_tokens | Auth & organization |
| assets, asset_meters | Equipment registry & meter readings |
| work_orders, wo_labor, wo_parts, wo_attachments | Work order lifecycle |
| pm_templates, pm_tasks | Preventive maintenance |
| inventory_items, inventory_transactions | Spare parts & stock |
| vendors, purchase_requisitions, pr_line_items | Procurement |
| purchase_orders, po_line_items, goods_received_notes | PO & GRN |
| notifications | Real-time alerts (schema ready) |
| audit_logs | Full audit trail |
| documents, certifications | Schema ready — UI not built |
| system_config | App settings (backup schedule, company name, etc.) |

**Data persistence:** All create/update/delete operations go through the API → Prisma → PostgreSQL. Data survives restarts and is included in nightly backups.

---

## 7. API Endpoints (Summary)

| Route Prefix | Module |
|--------------|--------|
| `/api/auth` | Login, refresh, logout, me |
| `/api/users` | User CRUD (admin) |
| `/api/departments` | Department list |
| `/api/dashboard` | Stats, audit logs |
| `/api/assets` | Equipment CRUD, hierarchy, lookup, transfer, decommission |
| `/api/work-orders` | WO lifecycle, assign, labor, approve |
| `/api/pm-templates` | PM templates, forecast, run scheduler |
| `/api/inventory` | Items, transactions, alerts, barcode |
| `/api/vendors` | Vendor CRUD |
| `/api/purchase-requisitions` | PR workflow |
| `/api/purchase-orders` | PO workflow + GRN receive |
| `/api/reports` | KPIs + 10 standard reports |
| `/api/settings` | System config, backups (admin) |
| `/api/health` | Health check |

---

## 8. UI Screens (Client)

| Screen | Route | Roles |
|--------|-------|-------|
| Login | `/login` | All |
| Dashboard | `/dashboard` | All |
| User Management | `/dashboard/users` | admin |
| Equipment Registry | `/dashboard/equipment` | All (read); engineer+ (write) |
| Work Orders | `/dashboard/work-orders` | All maintenance roles |
| PM Scheduling | `/dashboard/pm` | engineer, supervisor, manager+ |
| Inventory | `/dashboard/inventory` | storekeeper, admin (write) |
| Purchasing | `/dashboard/purchasing` | storekeeper, engineer, approvers |
| Reports & Analytics | `/dashboard/reports` | manager, engineer, supervisor+ |
| Help & Training | `/dashboard/help` | All |
| System Config | `/dashboard/settings` | admin |

---

## 9. Development Phases — All Complete

| Phase | Duration (spec) | Deliverable | Status |
|-------|-----------------|-------------|--------|
| 1 — Foundation | 2 weeks | Auth, users, DB schema, Electron shell | ✅ |
| 2 — Assets | 2 weeks | Equipment registry, barcode | ✅ |
| 3 — Work Orders | 3 weeks | Full WO lifecycle | ✅ |
| 4 — PM Scheduling | 2 weeks | Templates, auto-WO generation | ✅ |
| 5 — Inventory | 2 weeks | Stock, transactions, alerts | ✅ |
| 6 — Purchasing | 2 weeks | PR, PO, GRN, vendors | ✅ |
| 7 — Reports | 2 weeks | KPIs, MTTR/MTBF, export | ✅ |
| 8 — Security | 1 week | Hardening, backups, audit | ✅ |
| 9 — Testing & Training | 2 weeks | 28 automated tests, help guides | ✅ |

**Total spec timeline:** ~18 weeks — **delivered.**

---

## 10. Testing & Quality Assurance

| Test Type | Command | Coverage |
|-----------|---------|----------|
| Unit tests | `npm test` | Permissions, backup utils, report utils |
| Integration tests | `npm test` | All API modules, RBAC (28 tests, all passing) |
| Smoke test | `npm run smoke-test` | End-to-end against live server (11 checks) |
| Client build | `npm run build` | TypeScript + Vite production build |

---

## 11. Deployment Model

### Development (current)
```bash
cd "/home/kashif/Desktop/LIBERTY Tool MGT"
npm install
cp .env.example .env          # configure DATABASE_URL
npm run db:setup              # prisma generate + migrate + seed
npm run dev                   # API server + Electron desktop app
```
Login: `admin` / `Admin@123` (desktop window opens automatically)

### Production — Server PC (LAN)
1. Install PostgreSQL 16 + Node.js 20 LTS
2. Configure `.env` with LAN IP, strong JWT secrets, `BACKUP_ENCRYPTION_KEY`
3. `npm run db:setup && npm run build`
4. Run API as Windows Service or PM2: `npm run start -w @ldpl/cmms-server`
5. Cron: `0 2 * * * npm run backup` → copy `backups/` to external HDD

### Production — Workstation PCs
1. `npm run package:win -w @ldpl/cmms-desktop`
2. Install `.exe` from `packages/desktop/out/`
3. Point to server URL (e.g. `http://192.168.1.100:3001`)

### Hardware (spec recommendation)
- **Server PC:** 8 GB RAM, 500 GB HDD, UPS (2+ hours), 2 TB external HDD for backups
- **Workstations:** Standard Windows PCs on 1 Gbps LAN
- **No internet required** for daily operation

---

## 12. Sample / Demo Data (Seeded)

| Entity | Sample Records |
|--------|----------------|
| Users | admin, manager, engineer, supervisor, storekeeper, technician |
| Departments | MNT, ELE, MEC, INS, STR, OPS, IT, ADM |
| Assets | LDPL-00001 (Plant) → LDPL-00005 (Component) |
| Work Orders | WO-2026-00001 (CM), WO-2026-00002 (PM) |
| PM Templates | Monthly Motor, Quarterly Cooling Tower |
| Inventory | ITM-00001 to ITM-00004 (bearings, oil, belts, contactor) |
| Vendors | VND-SKF, VND-SIE |
| Purchase Requisition | PR-2026-00001 (submitted) |

---

## 13. What Is NOT Yet Built (Spec vs v1.0 Gap)

These items exist in the **full specification** or **future roadmap** but are **out of scope for v1.0**:

| Item | Notes |
|------|-------|
| Module 4.6 — Full Labor & HR | Basic WO labor logging only; no skills registry, certification UI, shift calendar, contractors |
| Module 4.8 — Notifications UI | Backend + Socket.io ready; no in-app notification inbox; no escalation timers |
| Module 4.9 — Document Management | DB schema exists; no upload/version UI |
| Reports: Downtime, Vendor Performance | Not implemented (8 of 10 spec reports done) |
| HTTPS on LAN | Deployment configuration (reverse proxy), not in app code |
| Email notifications (SMTP) | Future roadmap |
| Mobile app (React Native) | Future roadmap — High priority |
| IoT / PdM sensor integration | Future roadmap |
| SSO with LDPL Operations Portal | Future — same tech stack enables this |
| Islamabad head office (Tailscale VPN) | Future roadmap |
| Budget management module | Future roadmap |

---

## 14. Future Roadmap (Post v1.0)

| Feature | Priority |
|---------|----------|
| Mobile app for technicians | High |
| Budget vs actual spend tracking | High |
| Email/SMTP notifications | Medium |
| IoT sensor → PdM work orders | Medium |
| Islamabad branch via Tailscale VPN | Medium |
| Operations Portal integration / SSO | Medium |
| Energy management per asset | Medium |
| KPI industry benchmarking | Low |

---

## 15. Integration with LDPL Operations Portal

- Both systems use **Electron + React + Node.js + PostgreSQL**
- Future: shared database, vehicle maintenance → CMMS assets, single sign-on
- Runs on same LAN server PC — no extra hardware cost

---

## 16. Key Value Propositions (for Presentation)

1. **Replaces discontinued MP2** — modern, maintainable, company-owned codebase
2. **End-to-end maintenance workflow** — asset → WO → parts → cost → report in one system
3. **Automated PM** — reduces missed maintenance, extends asset life
4. **Integrated stores & procurement** — PR → PO → GRN → stock, no manual spreadsheets
5. **Management KPIs** — MTTR, MTBF, PM compliance, cost visibility for GM/Manager
6. **Security & compliance** — audit trail, role-based access, encrypted backups
7. **LAN-only, no cloud dependency** — data stays on-site at Daharki plant
8. **Same stack as Operations Portal** — lower IT cost, easier future integration
9. **Production tested** — 28 automated tests, smoke test suite, in-app training
10. **Scalable** — monorepo architecture, clear API, ready for mobile and IoT phases

---

## 17. Default Access (Demo / UAT)

| Username | Password | Role |
|----------|----------|------|
| admin | Admin@123 | System Administrator |
| manager | Admin@123 | Plant Manager |
| engineer | Admin@123 | Maintenance Engineer |
| supervisor | Admin@123 | Supervisor |
| storekeeper | Admin@123 | Storekeeper |
| technician | Admin@123 | Technician |

**⚠ Change all passwords before production go-live.**

---

## 18. Contact & Ownership

| Item | Detail |
|------|--------|
| Organization | Liberty Daharki Powers Ltd |
| Plant | 235 MW Power Plant, Daharki |
| System | LDPL CMMS v1.0 |
| Prepared by | IT Department — LDPL |
| Spec document | `LDPL_CMMS_Full_Specification.docx` |
| License | Confidential — Internal Use Only |

---

*This document summarizes the implemented LDPL CMMS as of June 2026. Use it as full context for proposal decks, stakeholder briefings, and UAT planning.*

# LDPL CMMS — Production Release v1.0.0

**Status:** Production ready — all 9 development phases complete.

## Quick links

| Document | Purpose |
|----------|---------|
| [DEPLOYMENT.md](./DEPLOYMENT.md) | **Start here** — server + workstation rollout |
| [README.md](./README.md) | Development setup and module overview |

## Rollout summary

1. **Server PC** — PostgreSQL + API (`bash scripts/setup-server.sh` → `bash scripts/start-server.sh`)
2. **Workstations** — Install desktop app from `packages/desktop/out/`
3. **Configure** — Each workstation: server URL `http://<SERVER_LAN_IP>:3001`
4. **Go-live** — Change default passwords via Settings (admin)

## Build commands

```bash
npm run build:release      # Build client + server + desktop shell
npm run package:win        # Windows installer → packages/desktop/out/
npm run package:linux      # Linux AppImage → packages/desktop/out/
```

## Default credentials (change before go-live)

`admin` / `Admin@123` — and all demo roles use the same password.

---

Confidential — Liberty Daharki Powers Ltd

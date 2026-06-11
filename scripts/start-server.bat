@echo off
REM LDPL CMMS — Start API server (Windows Server PC)
setlocal
cd /d "%~dp0.."

if not exist .env (
  echo ERROR: .env not found. Copy .env.example to .env and configure it first.
  exit /b 1
)

set NODE_ENV=production

if not exist packages\server\prisma\schema.prisma (
  echo ERROR: server package not found.
  exit /b 1
)

if not exist uploads mkdir uploads
if not exist backups mkdir backups

echo Starting LDPL CMMS API server...
call npm run start -w @ldpl/cmms-server

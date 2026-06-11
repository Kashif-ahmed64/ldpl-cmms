@echo off
REM LDPL CMMS — First-time server setup (Windows Server PC)
setlocal
cd /d "%~dp0.."

echo === LDPL CMMS Server Setup ===

if not exist .env (
  copy .env.example .env
  echo.
  echo Created .env — edit DATABASE_URL and JWT secrets, then run this script again.
  exit /b 1
)

findstr /C:"REPLACE_WITH" .env >nul 2>&1 && (
  echo ERROR: .env still has placeholder values. Edit JWT secrets and DATABASE_URL first.
  exit /b 1
)

echo Installing dependencies...
call npm install

echo Building server...
call npm run build -w @ldpl/cmms-server

cd packages\server
echo Applying database schema...
call npx prisma migrate deploy
if errorlevel 1 (
  echo Migrate deploy failed — trying db push...
  call npx prisma db push
)

echo Seeding demo data...
call npm run db:seed
cd ..\..

if not exist uploads mkdir uploads
if not exist backups mkdir backups

echo.
echo === Server setup complete ===
echo Start with: scripts\start-server.bat
echo Workstations connect to: http://YOUR_SERVER_IP:3001

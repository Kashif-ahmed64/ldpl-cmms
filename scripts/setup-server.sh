#!/usr/bin/env bash
# LDPL CMMS — First-time server setup (run on the SERVER PC)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== LDPL CMMS Server Setup ==="

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo ""
  echo "Created .env from .env.example"
  echo "IMPORTANT: Edit .env now — set DATABASE_URL, JWT_SECRET, JWT_REFRESH_SECRET"
  echo "Then run this script again."
  exit 1
fi

# shellcheck disable=SC1091
if grep -q 'REPLACE_WITH' .env 2>/dev/null; then
  echo "ERROR: .env still contains placeholder values. Edit JWT secrets and DATABASE_URL first."
  exit 1
fi

echo "Installing dependencies..."
npm install

echo "Building server (Prisma client)..."
npm run build -w @ldpl/cmms-server

echo "Applying database schema..."
cd packages/server

if npx prisma migrate deploy 2>/dev/null; then
  echo "Migrations applied."
else
  echo "Migrate deploy skipped or failed — trying db push for existing databases..."
  npx prisma db push --accept-data-loss=false || true
fi

echo "Seeding demo data (safe to re-run — upserts where applicable)..."
npm run db:seed || echo "Seed completed or skipped."

cd "$ROOT"

mkdir -p uploads backups packages/server/uploads packages/server/backups

echo ""
echo "=== Server setup complete ==="
echo ""
echo "Start the API server:"
echo "  npm run start:server"
echo ""
echo "Or install as a service:"
echo "  sudo cp deploy/ldpl-cmms-server.service /etc/systemd/system/"
echo "  sudo systemctl enable --now ldpl-cmms-server"
echo ""
echo "Note the LAN IP printed when the server starts — workstations need:"
echo "  http://<SERVER_LAN_IP>:3001"

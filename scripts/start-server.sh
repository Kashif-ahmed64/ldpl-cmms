#!/usr/bin/env bash
# LDPL CMMS — Start API server (production)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export NODE_ENV="${NODE_ENV:-production}"

if [[ ! -f .env ]]; then
  echo "ERROR: .env not found. Run: bash scripts/setup-server.sh"
  exit 1
fi

if [[ ! -f packages/server/prisma/schema.prisma ]]; then
  echo "ERROR: server package not found."
  exit 1
fi

mkdir -p uploads backups

echo "Starting LDPL CMMS API server..."
exec npm run start -w @ldpl/cmms-server

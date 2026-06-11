#!/usr/bin/env bash
# LDPL CMMS — Full production build (client + server + desktop shell)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "=== LDPL CMMS Release Build ==="

npm install
npm run build

echo ""
echo "=== Build complete ==="
echo "  Client UI:  packages/client/dist/"
echo "  API server: packages/server/ (runs via tsx — Prisma client generated)"
echo "  Desktop:    packages/desktop/dist/"
echo ""
echo "Package desktop installer:"
echo "  npm run package:linux   # Linux AppImage"
echo "  npm run package:win     # Windows NSIS (build on Windows recommended)"
echo ""
echo "Start server + desktop on this machine:"
echo "  npm run start"

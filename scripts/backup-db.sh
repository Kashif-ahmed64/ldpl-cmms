#!/usr/bin/env bash
# LDPL CMMS — Nightly database backup script
# Usage: ./scripts/backup-db.sh
# Cron:  0 2 * * * /path/to/LIBERTY\ Tool\ MGT/scripts/backup-db.sh >> /var/log/ldpl-backup.log 2>&1

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PROJECT_DIR/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/.env"
  set +a
elif [ -f "$PROJECT_DIR/packages/server/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "$PROJECT_DIR/packages/server/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL not set"
  exit 1
fi

BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y-%m-%d_%H-%M-%S)"
BASE_NAME="ldpl_cmms_${TIMESTAMP}.sql.gz"
TMP_FILE="$BACKUP_DIR/.tmp_${BASE_NAME}"

echo "[$(date -Iseconds)] Starting backup..."

pg_dump --dbname="${DATABASE_URL%%\?*}" --no-owner --no-acl | gzip > "$TMP_FILE"

if [ -n "${BACKUP_ENCRYPTION_KEY:-}" ]; then
  OUT_FILE="$BACKUP_DIR/${BASE_NAME}.enc"
  openssl enc -aes-256-cbc -salt -pbkdf2 \
    -in "$TMP_FILE" -out "$OUT_FILE" \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}"
  rm -f "$TMP_FILE"
  FINAL="$OUT_FILE"
else
  FINAL="$BACKUP_DIR/$BASE_NAME"
  mv "$TMP_FILE" "$FINAL"
fi

SIZE=$(stat -c%s "$FINAL" 2>/dev/null || stat -f%z "$FINAL")
echo "[$(date -Iseconds)] Backup complete: $FINAL ($SIZE bytes)"

# Retention cleanup
RETENTION="${BACKUP_RETENTION_DAYS:-30}"
find "$BACKUP_DIR" -name 'ldpl_cmms_*' -type f -mtime +"$RETENTION" -delete 2>/dev/null || true

echo "[$(date -Iseconds)] Old backups older than ${RETENTION} days removed"

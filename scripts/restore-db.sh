#!/usr/bin/env bash
# LDPL CMMS — Database restore script
# Usage: ./scripts/restore-db.sh <backup-file>
# WARNING: This will overwrite the current database!

set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage: $0 <backup-file.sql.gz[.enc]>"
  exit 1
fi

BACKUP_FILE="$1"
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

if [ ! -f "$BACKUP_FILE" ]; then
  echo "ERROR: Backup file not found: $BACKUP_FILE"
  exit 1
fi

echo "WARNING: This will restore $BACKUP_FILE into the database."
echo "Database: $DATABASE_URL"
read -r -p "Type YES to confirm: " CONFIRM
if [ "$CONFIRM" != "YES" ]; then
  echo "Aborted."
  exit 1
fi

TMP_SQL="/tmp/ldpl_restore_$$.sql"

if [[ "$BACKUP_FILE" == *.enc ]]; then
  if [ -z "${BACKUP_ENCRYPTION_KEY:-}" ]; then
    echo "ERROR: BACKUP_ENCRYPTION_KEY required for encrypted backups"
    exit 1
  fi
  TMP_GZ="/tmp/ldpl_restore_$$.sql.gz"
  openssl enc -d -aes-256-cbc -pbkdf2 \
    -in "$BACKUP_FILE" -out "$TMP_GZ" \
    -pass "pass:${BACKUP_ENCRYPTION_KEY}"
  gunzip -c "$TMP_GZ" > "$TMP_SQL"
  rm -f "$TMP_GZ"
else
  gunzip -c "$BACKUP_FILE" > "$TMP_SQL"
fi

echo "Restoring..."
psql "$DATABASE_URL" < "$TMP_SQL"
rm -f "$TMP_SQL"

echo "Restore complete."

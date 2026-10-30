#!/usr/bin/env bash
# Consistent SQLite backup for the deployed platform.
#
# The database runs in WAL mode, so a plain `cp` (and by extension an ECS
# snapshot) can capture a half-written file. `sqlite3 .backup` uses the online
# backup API instead: it waits for in-flight writes and produces a file that is
# guaranteed to open.
#
# Install on the server:
#   sudo apt-get install -y sqlite3
#   sudo install -m 755 deploy/backup-db.sh /usr/local/bin/koreamate-backup
#   sudo crontab -l 2>/dev/null | { cat; echo '20 19 * * * /usr/local/bin/koreamate-backup'; } | sudo crontab -
#
# Restore (stop the app first so nothing writes during the swap):
#   docker compose -f deploy/compose.yaml down
#   gunzip -c /var/backups/koreamate/platform-YYYYmmdd-HHMMSS.sqlite.gz \
#     > /var/lib/docker/volumes/deploy_platform-data/_data/platform.sqlite
#   rm -f /var/lib/docker/volumes/deploy_platform-data/_data/platform.sqlite-wal \
#         /var/lib/docker/volumes/deploy_platform-data/_data/platform.sqlite-shm
#   docker compose -f deploy/compose.yaml up -d
set -euo pipefail

DB="${KOREAMATE_DB:-/var/lib/docker/volumes/deploy_platform-data/_data/platform.sqlite}"
OUT="${KOREAMATE_BACKUP_DIR:-/var/backups/koreamate}"
KEEP_DAYS="${KOREAMATE_KEEP_DAYS:-30}"
LOG="$OUT/backup.log"

log() { printf '%s %s\n' "$(date '+%F %T')" "$*" >> "$LOG"; }

mkdir -p "$OUT"
touch "$LOG"

if [ ! -f "$DB" ]; then
  log "FAIL database not found at $DB"
  exit 1
fi

stamp="$(date '+%Y%m%d-%H%M%S')"
tmp="$OUT/platform-$stamp.sqlite"

# .backup copies through SQLite itself, so WAL contents are folded in.
if ! sqlite3 "$DB" ".backup '$tmp'" 2>>"$LOG"; then
  log "FAIL .backup failed"
  rm -f "$tmp"
  exit 1
fi

# A backup that cannot be opened is worse than no backup, so verify before
# rotating anything out.
if [ "$(sqlite3 "$tmp" 'PRAGMA integrity_check;' 2>>"$LOG")" != "ok" ]; then
  log "FAIL integrity_check on $tmp"
  rm -f "$tmp"
  exit 1
fi

gzip -9 "$tmp"
chmod 600 "$tmp.gz"

find "$OUT" -name 'platform-*.sqlite.gz' -mtime "+$KEEP_DAYS" -delete

log "OK $(basename "$tmp.gz") $(du -h "$tmp.gz" | cut -f1) ($(find "$OUT" -name 'platform-*.sqlite.gz' | wc -l) kept)"

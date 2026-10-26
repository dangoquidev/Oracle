#!/usr/bin/env bash
# Dumps the database, keeps the last 7 daily and 4 weekly dumps (configurable in .env),
# then optionally copies them off-site with rsync and/or restic. Meant to run daily (systemd timer or cron).
set -euo pipefail

# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

partial=''
# Runs once whatever stopped the script (a trap on ERR would also fire inside functions).
on_exit() {
  local status=$?
  [[ -z "$partial" ]] || rm -f "$partial"
  if [[ $status -ne 0 ]]; then
    log "Backup failed (exit status $status)"
    send_alert '🔴 Oracle backup failed' \
      "scripts/backup.sh exited with status $status. Check the logs (journalctl -u oracle-backup)."
  fi
}
trap on_exit EXIT

KEEP_DAILY="$(env_value BACKUP_KEEP_DAILY 7)"
KEEP_WEEKLY="$(env_value BACKUP_KEEP_WEEKLY 4)"
[[ "$KEEP_DAILY" =~ ^[1-9][0-9]*$ && "$KEEP_WEEKLY" =~ ^[0-9]+$ ]] || die "Invalid BACKUP_KEEP_DAILY / BACKUP_KEEP_WEEKLY"

mkdir -p "$BACKUP_DIR/daily" "$BACKUP_DIR/weekly"
chmod 700 "$BACKUP_DIR"

stamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
file="$BACKUP_DIR/daily/oracle-$stamp.dump"
partial="$file.partial"

log "Dumping $DB_NAME…"
compose exec -T postgres pg_dump --username "$DB_USER" --dbname "$DB_NAME" --format custom --no-owner </dev/null >"$partial"
# A dump that pg_restore cannot read is worthless: check it before keeping it.
compose exec -T postgres pg_restore --list <"$partial" >/dev/null
mv "$partial" "$file"
log "Saved $file ($(du -h "$file" | cut -f1))"

# A weekly copy whenever the latest one is at least 7 days old (robust to missed runs).
if [[ "$KEEP_WEEKLY" -gt 0 ]] && [[ -z "$(find "$BACKUP_DIR/weekly" -name 'oracle-*.dump' -mtime -6 -print -quit)" ]]; then
  cp -p "$file" "$BACKUP_DIR/weekly/"
  log "Weekly copy kept"
fi

# Names sort chronologically: keep the newest ones.
prune() {
  local dir="$1" keep="$2"
  find "$dir" -maxdepth 1 -name 'oracle-*.dump' -printf '%f\n' | sort -r | tail -n +"$((keep + 1))" |
    while read -r old; do
      rm -f "$dir/$old"
      log "Removed $dir/$old"
    done
}
prune "$BACKUP_DIR/daily" "$KEEP_DAILY"
prune "$BACKUP_DIR/weekly" "$KEEP_WEEKLY"

rsync_target="$(env_value BACKUP_RSYNC_TARGET)"
if [[ -n "$rsync_target" ]]; then
  log "Copying to $rsync_target…"
  rsync --archive --delete "$BACKUP_DIR/" "$rsync_target/"
fi

restic_repository="$(env_value RESTIC_REPOSITORY)"
if [[ -n "$restic_repository" ]]; then
  export RESTIC_REPOSITORY="$restic_repository"
  RESTIC_PASSWORD_FILE="$(env_value RESTIC_PASSWORD_FILE)"
  export RESTIC_PASSWORD_FILE
  log "Sending to restic ($RESTIC_REPOSITORY)…"
  restic backup --quiet --tag oracle "$BACKUP_DIR"
  restic forget --quiet --tag oracle --keep-daily "$KEEP_DAILY" --keep-weekly "$KEEP_WEEKLY" --prune
fi

log "Backup done"

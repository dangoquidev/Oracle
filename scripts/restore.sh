#!/usr/bin/env bash
# Restores a dump made by backup.sh: saves the current database first, replaces it with the dump,
# then restarts the bot (which applies any newer migration on start).
# Usage: scripts/restore.sh [--yes] <file.dump>
set -euo pipefail

# shellcheck source=scripts/common.sh
source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

assume_yes=false
if [[ "${1:-}" == "--yes" ]]; then
  assume_yes=true
  shift
fi
[[ $# -eq 1 ]] || die "Usage: scripts/restore.sh [--yes] <file.dump>"
dump="$1"
[[ -f "$dump" ]] || die "No such file: $dump"

# Compose would otherwise read the confirmation typed below.
compose up -d postgres </dev/null >/dev/null
wait_for_postgres
compose exec -T postgres pg_restore --list <"$dump" >/dev/null || die "$dump is not a readable pg_dump archive"

if ! $assume_yes; then
  printf 'This replaces the database "%s" with %s.\nType the database name to confirm: ' "$DB_NAME" "$dump"
  read -r answer || answer=''
  [[ "$answer" == "$DB_NAME" ]] || die "Cancelled"
fi

bot_was_running=false
if has_service bot && [[ -n "$(compose ps --status running --quiet bot </dev/null)" ]]; then
  bot_was_running=true
fi
if has_service bot; then
  log "Stopping the bot…"
  compose stop bot </dev/null >/dev/null
fi

# Safety net: the current state can be restored the same way.
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
if compose exec -T postgres psql --username "$DB_USER" --dbname postgres --tuples-only --no-align \
  --command "select 1 from pg_database where datname = '$DB_NAME'" </dev/null | grep -q 1; then
  safety="$BACKUP_DIR/pre-restore-$(date -u +%Y-%m-%dT%H%M%SZ).dump"
  compose exec -T postgres pg_dump --username "$DB_USER" --dbname "$DB_NAME" --format custom --no-owner </dev/null >"$safety"
  log "Current database saved to $safety"
fi

log "Recreating $DB_NAME…"
compose exec -T postgres psql --username "$DB_USER" --dbname postgres --quiet --set ON_ERROR_STOP=1 \
  --command "drop database if exists \"$DB_NAME\" with (force)" \
  --command "create database \"$DB_NAME\" owner \"$DB_USER\"" </dev/null
log "Restoring $dump…"
compose exec -T postgres pg_restore --username "$DB_USER" --dbname "$DB_NAME" --no-owner --exit-on-error <"$dump"

if has_service bot && ($bot_was_running || $assume_yes); then
  log "Starting the bot…"
  compose up -d bot </dev/null >/dev/null
fi
log "Restore done"

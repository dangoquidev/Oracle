# shellcheck shell=bash
# Shared helpers for the operation scripts (sourced, not executed).
# ORACLE_DIR overrides the project directory (the one holding docker-compose.yml and .env).

ORACLE_DIR="${ORACLE_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
ENV_FILE="$ORACLE_DIR/.env"

log() {
  printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"
}

die() {
  log "ERROR: $*" >&2
  exit 1
}

# Reads KEY from .env without executing it (values may contain characters a shell would interpret).
env_value() {
  local key="$1" default="${2:-}" line value
  line="$(grep -E "^${key}=" "$ENV_FILE" 2>/dev/null | tail -n 1 || true)"
  value="${line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  value="${value%\'}"
  value="${value#\'}"
  printf '%s' "${value:-$default}"
}

compose() {
  docker compose --project-directory "$ORACLE_DIR" "$@"
}

has_service() {
  compose config --services </dev/null | grep -qx "$1"
}

wait_for_postgres() {
  local attempt
  for attempt in $(seq 1 30); do
    if compose exec -T postgres pg_isready -U "$DB_USER" -d postgres </dev/null >/dev/null 2>&1; then
      return 0
    fi
    log "Waiting for PostgreSQL ($attempt/30)…"
    sleep 2
  done
  die "PostgreSQL is not ready"
}

# Posts a message to ALERT_WEBHOOK_URL when configured; never fails the caller.
send_alert() {
  local title="$1" detail="$2" url payload
  url="$(env_value ALERT_WEBHOOK_URL)"
  [[ -n "$url" ]] || return 0
  payload="$(printf '{"username":"Oracle alerts","allowed_mentions":{"parse":[]},"embeds":[{"title":"%s","description":"%s","color":15548997,"footer":{"text":"%s"}}]}' \
    "$(json_escape "$title")" "$(json_escape "$detail")" "$(json_escape "$(uname -n)")")"
  curl --silent --show-error --max-time 10 --header 'Content-Type: application/json' \
    --data "$payload" "$url" >/dev/null || log "Could not send the alert"
}

json_escape() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  value="${value//$'\n'/\\n}"
  value="${value//$'\t'/ }"
  printf '%s' "$value"
}

[[ -f "$ENV_FILE" ]] || die "No .env in $ORACLE_DIR"
# Used by the scripts sourcing this file.
# shellcheck disable=SC2034
DB_USER="$(env_value POSTGRES_USER oracle)"
# shellcheck disable=SC2034
DB_NAME="$(env_value POSTGRES_DB oracle)"
BACKUP_DIR="$(env_value BACKUP_DIR backups)"
[[ "$BACKUP_DIR" = /* ]] || BACKUP_DIR="$ORACLE_DIR/$BACKUP_DIR"

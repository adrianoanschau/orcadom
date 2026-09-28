#!/usr/bin/env bash
# Shared helpers for dump, restore and restore-test.
set -euo pipefail

BACKUP_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export BACKUP_ROOT
export BACKUP_METRICS_DIR="${BACKUP_METRICS_DIR:-/var/lib/backup-metrics}"
export BACKUP_KEYS_DIR="${BACKUP_KEYS_DIR:-/keys}"
export TZ="${TZ:-America/Sao_Paulo}"

POSTGRES_USER="${POSTGRES_USER:-orcadom}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-}"
POSTGRES_DB="${POSTGRES_DB:-orcadom_db}"
PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"

BACKUP_S3_BUCKET="${BACKUP_S3_BUCKET:-orcadom-backups}"
BACKUP_S3_PREFIX="${BACKUP_S3_PREFIX:-}"
BACKUP_S3_REGION="${BACKUP_S3_REGION:-us-east-1}"
BACKUP_S3_ENDPOINT="${BACKUP_S3_ENDPOINT:-}"
BACKUP_RETENTION_DAILY="${BACKUP_RETENTION_DAILY:-7}"
BACKUP_RETENTION_WEEKLY="${BACKUP_RETENTION_WEEKLY:-4}"
BACKUP_RETENTION_MONTHLY="${BACKUP_RETENTION_MONTHLY:-6}"

log_json() {
  local level="$1"
  local msg="$2"
  shift 2
  python3 - "$level" "$msg" "$@" <<'PY'
import json, sys, datetime
level, msg, *rest = sys.argv[1:]
payload = {
    "ts": datetime.datetime.now(datetime.timezone.utc).isoformat(),
    "level": level,
    "msg": msg,
    "component": "postgres-backup",
}
for item in rest:
    if "=" not in item:
        continue
    key, value = item.split("=", 1)
    payload[key] = value
print(json.dumps(payload, ensure_ascii=False), flush=True)
PY
}

log_info() { log_json info "$@"; }
log_error() { log_json error "$@"; }

die() {
  log_error "$1"
  exit 1
}

metrics() {
  python3 "$BACKUP_ROOT/metrics.py" "$@"
}

gfs() {
  python3 "$BACKUP_ROOT/gfs.py" "$@"
}

capture_sentry() {
  python3 "$BACKUP_ROOT/sentry_event.py" "$@" || true
}

job_started_at=""
job_name=""
job_failed=0

begin_job() {
  job_name="$1"
  job_started_at="$(date +%s)"
  job_failed=0
  trap 'job_on_err' ERR
}

job_on_err() {
  if [ "$job_failed" = "1" ]; then
    return
  fi
  job_failed=1
  trap - ERR
  local duration=0
  if [ -n "$job_started_at" ]; then
    duration=$(( $(date +%s) - job_started_at ))
  fi
  metrics inc "$job_name" failure || true
  metrics set last_duration "$job_name" "$duration" || true
  capture_sentry "$job_name" "orcadom postgres ${job_name} failed"
  log_error "${job_name} failed" durationSeconds="$duration"
  exit 1
}

finish_job() {
  trap - ERR
  local duration=$(( $(date +%s) - job_started_at ))
  metrics inc "$job_name" success
  metrics set last_success "$job_name" "$(date +%s)"
  metrics set last_duration "$job_name" "$duration"
  log_info "${job_name} completed" durationSeconds="$duration"
}

s3() {
  local extra=()
  if [ -n "$BACKUP_S3_ENDPOINT" ]; then
    extra+=(--endpoint-url "$BACKUP_S3_ENDPOINT")
  fi
  AWS_EC2_METADATA_DISABLED=true \
    AWS_PAGER="" \
    AWS_ACCESS_KEY_ID="${BACKUP_S3_ACCESS_KEY:?BACKUP_S3_ACCESS_KEY is required}" \
    AWS_SECRET_ACCESS_KEY="${BACKUP_S3_SECRET_KEY:?BACKUP_S3_SECRET_KEY is required}" \
    AWS_DEFAULT_REGION="$BACKUP_S3_REGION" \
    aws "${extra[@]}" --region "$BACKUP_S3_REGION" s3 "$@"
}

s3_uri() {
  local key="${1:-}"
  if [ -n "$BACKUP_S3_PREFIX" ]; then
    if [ -n "$key" ]; then
      printf 's3://%s/%s/%s' "$BACKUP_S3_BUCKET" "${BACKUP_S3_PREFIX%/}" "$key"
    else
      printf 's3://%s/%s' "$BACKUP_S3_BUCKET" "${BACKUP_S3_PREFIX%/}"
    fi
  else
    if [ -n "$key" ]; then
      printf 's3://%s/%s' "$BACKUP_S3_BUCKET" "$key"
    else
      printf 's3://%s' "$BACKUP_S3_BUCKET"
    fi
  fi
}

s3_relative_key() {
  local key="$1"
  local prefix="${BACKUP_S3_PREFIX%/}"
  if [ -n "$prefix" ]; then
    key="${key#"$prefix"/}"
  fi
  printf '%s' "$key"
}

list_s3_keys() {
  s3 ls "$(s3_uri)" --recursive | awk '{print $4}' | while read -r key; do
    [ -n "$key" ] || continue
    s3_relative_key "$key"
    printf '\n'
  done
}

dump_keys_in_slot() {
  local slot="$1"
  local prefix="${slot}/${POSTGRES_DB}-"
  local suffix=".dump.fc.age"
  list_s3_keys | while read -r key; do
    [ -n "$key" ] || continue
    case "$key" in
      "${prefix}"*"${suffix}") printf '%s\n' "$key" ;;
    esac
  done
}

wait_for_s3() {
  local i=0
  while [ "$i" -lt 60 ]; do
    if s3 ls "$(s3_uri)" >/dev/null 2>&1; then
      return 0
    fi
    s3 mb "$(s3_uri)" >/dev/null 2>&1 || true
    i=$((i + 1))
    sleep 1
  done
  die "cannot reach S3 bucket ${BACKUP_S3_BUCKET}"
}

latest_dump_key() {
  local slot="${1:-daily}"
  dump_keys_in_slot "$slot" | sort | tail -n 1
}

latest_manifest_key() {
  local dump_key="$1"
  printf '%s' "${dump_key%.dump.fc.age}.manifest.json"
}

assert_restore_target_safe() {
  local host="$1"
  local db="$2"
  if [ "$host" = "127.0.0.1" ] || [ "$host" = "localhost" ]; then
    return 0
  fi
  if [ "$host" = "$PGHOST" ] && [ "$db" = "$POSTGRES_DB" ]; then
    if [ "${ORCADOM_RESTORE_OVERWRITE:-}" != "I_UNDERSTAND" ]; then
      die "refusing to restore onto the live database ${db} at ${host}. Use --target-db with a new name, or set ORCADOM_RESTORE_OVERWRITE=I_UNDERSTAND"
    fi
  fi
}

wait_for_postgres() {
  local host="${1:-$PGHOST}"
  local port="${2:-$PGPORT}"
  local user="${3:-$POSTGRES_USER}"
  local db="${4:-$POSTGRES_DB}"
  local attempts="${5:-60}"
  local i=0
  while [ "$i" -lt "$attempts" ]; do
    if PGPASSWORD="$POSTGRES_PASSWORD" pg_isready -h "$host" -p "$port" -U "$user" -d "$db" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  die "postgres is not ready at ${host}:${port}"
}

age_identity_file() {
  local path="${BACKUP_KEYS_DIR}/identity.txt"
  if [ -f "$path" ]; then
    printf '%s' "$path"
    return
  fi
  if [ -n "${BACKUP_AGE_SECRET_KEY:-}" ]; then
    mkdir -p "$BACKUP_KEYS_DIR"
    umask 077
    printf '%s\n' "$BACKUP_AGE_SECRET_KEY" >"$path"
    printf '%s' "$path"
    return
  fi
  die "BACKUP_AGE_SECRET_KEY or ${BACKUP_KEYS_DIR}/identity.txt is required to decrypt"
}

encrypt_file() {
  local src="$1"
  local dest="$2"
  local recipient="${BACKUP_AGE_PUBLIC_KEY:?BACKUP_AGE_PUBLIC_KEY is required}"
  age -r "$recipient" -o "$dest" "$src"
}

decrypt_file() {
  local src="$1"
  local dest="$2"
  age -d -i "$(age_identity_file)" -o "$dest" "$src"
}

collect_counts_json() {
  python3 "$BACKUP_ROOT/dbutil.py" collect \
    --host "$1" \
    --port "$2" \
    --user "$3" \
    --password "$4" \
    --database "$5"
}

source_pg_env() {
  export PGHOST
  export PGPORT
  export PGUSER="$POSTGRES_USER"
  export PGPASSWORD="$POSTGRES_PASSWORD"
  export PGDATABASE="$POSTGRES_DB"
}

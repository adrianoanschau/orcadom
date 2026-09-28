#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

mkdir -p "$BACKUP_METRICS_DIR"
exec 9>"$BACKUP_METRICS_DIR/dump.lock"
if ! flock -n 9; then
  die "another dump is already running"
fi

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

begin_job dump
wait_for_postgres
wait_for_s3
source_pg_env

DATE_STAMP="$(date +%F)"
TAKEN_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
DUMP_FILE="$WORKDIR/dump.fc"
ENCRYPTED="$WORKDIR/dump.fc.age"
MANIFEST="$WORKDIR/manifest.json"
COUNTS="$WORKDIR/counts.json"

log_info "starting dump" database="$POSTGRES_DB" date="$DATE_STAMP"

collect_counts_json "$PGHOST" "$PGPORT" "$POSTGRES_USER" "$POSTGRES_PASSWORD" "$POSTGRES_DB" >"$COUNTS"
PGPASSWORD="$POSTGRES_PASSWORD" pg_dump \
  -h "$PGHOST" \
  -p "$PGPORT" \
  -U "$POSTGRES_USER" \
  -d "$POSTGRES_DB" \
  -Fc \
  -Z 9 \
  -f "$DUMP_FILE"

PG_DUMP_VERSION="$(pg_dump --version | awk '{print $3}')"
python3 - "$MANIFEST" "$COUNTS" "$POSTGRES_DB" "$TAKEN_AT" "$DATE_STAMP" "$PG_DUMP_VERSION" <<'PY'
import json, sys, pathlib
dest, counts_path, database, taken_at, date_stamp, version = sys.argv[1:]
payload = {
    "database": database,
    "takenAt": taken_at,
    "date": date_stamp,
    "pgDumpVersion": version,
    "format": "custom",
    "compressed": True,
    "encrypted": "age",
    "rowCounts": json.loads(pathlib.Path(counts_path).read_text(encoding="utf-8")),
}
pathlib.Path(dest).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
PY

encrypt_file "$DUMP_FILE" "$ENCRYPTED"
DUMP_SIZE="$(wc -c <"$ENCRYPTED" | tr -d ' ')"

read -r -a SLOTS <<<"$(gfs slots "$DATE_STAMP")"
PRIMARY_SLOT="${SLOTS[0]}"
PRIMARY_DUMP_KEY="$(gfs key "$POSTGRES_DB" "$PRIMARY_SLOT" "$DATE_STAMP" ".dump.fc.age")"
PRIMARY_MANIFEST_KEY="$(gfs key "$POSTGRES_DB" "$PRIMARY_SLOT" "$DATE_STAMP" ".manifest.json")"

s3 cp "$ENCRYPTED" "$(s3_uri "$PRIMARY_DUMP_KEY")" --only-show-errors
s3 cp "$MANIFEST" "$(s3_uri "$PRIMARY_MANIFEST_KEY")" --only-show-errors
log_info "uploaded dump" slot="$PRIMARY_SLOT" key="$PRIMARY_DUMP_KEY" bytes="$DUMP_SIZE"

for slot in "${SLOTS[@]}"; do
  if [ "$slot" = "$PRIMARY_SLOT" ]; then
    continue
  fi
  dest_dump="$(gfs key "$POSTGRES_DB" "$slot" "$DATE_STAMP" ".dump.fc.age")"
  dest_manifest="$(gfs key "$POSTGRES_DB" "$slot" "$DATE_STAMP" ".manifest.json")"
  s3 cp "$(s3_uri "$PRIMARY_DUMP_KEY")" "$(s3_uri "$dest_dump")" --only-show-errors
  s3 cp "$(s3_uri "$PRIMARY_MANIFEST_KEY")" "$(s3_uri "$dest_manifest")" --only-show-errors
  log_info "promoted dump" slot="$slot" key="$dest_dump"
done

KEYS_FILE="$WORKDIR/keys.txt"
list_s3_keys >"$KEYS_FILE" || true

retain() {
  local slot="$1"
  local keep="$2"
  local to_delete
  to_delete="$(gfs retention "$POSTGRES_DB" "$slot" "$keep" ".dump.fc.age" <"$KEYS_FILE" || true)"
  if [ -z "$to_delete" ]; then
    return
  fi
  while IFS= read -r key; do
    [ -n "$key" ] || continue
    s3 rm "$(s3_uri "$key")" --only-show-errors >/dev/null
    log_info "removed expired dump" slot="$slot" key="$key"
  done <<<"$to_delete"
}

retain daily "$BACKUP_RETENTION_DAILY"
retain weekly "$BACKUP_RETENTION_WEEKLY"
retain monthly "$BACKUP_RETENTION_MONTHLY"

count_slot() {
  local slot="$1"
  local n
  n="$(dump_keys_in_slot "$slot" | wc -l | tr -d ' ')"
  metrics set retained "$slot" "${n:-0}"
}

count_slot daily
count_slot weekly
count_slot monthly

metrics set last_size dump "$DUMP_SIZE"
finish_job

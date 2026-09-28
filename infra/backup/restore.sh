#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

SLOT="daily"
DATE_STAMP=""
DUMP_KEY=""
TARGET_HOST="${PGHOST}"
TARGET_PORT="${PGPORT}"
TARGET_USER="${POSTGRES_USER}"
TARGET_PASSWORD="${POSTGRES_PASSWORD}"
TARGET_DB=""
CREATE_DB=1

usage() {
  cat <<'EOF'
Restore an encrypted pg_dump into a target database.

  restore.sh [--slot daily|weekly|monthly] [--date YYYY-MM-DD] [--key S3_KEY]
             [--target-host HOST] [--target-port PORT] [--target-db NAME]
             [--target-user USER]

Refuses to restore onto the live database unless ORCADOM_RESTORE_OVERWRITE=I_UNDERSTAND.
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --slot) SLOT="$2"; shift 2 ;;
    --date) DATE_STAMP="$2"; shift 2 ;;
    --key) DUMP_KEY="$2"; shift 2 ;;
    --target-host) TARGET_HOST="$2"; shift 2 ;;
    --target-port) TARGET_PORT="$2"; shift 2 ;;
    --target-db) TARGET_DB="$2"; shift 2 ;;
    --target-user) TARGET_USER="$2"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) die "unknown argument: $1" ;;
  esac
done

if [ -z "$TARGET_DB" ]; then
  die "--target-db is required (use a new database name, not the live one)"
fi

assert_restore_target_safe "$TARGET_HOST" "$TARGET_DB"
wait_for_s3

if [ -z "$DUMP_KEY" ]; then
  if [ -n "$DATE_STAMP" ]; then
    DUMP_KEY="$(gfs key "$POSTGRES_DB" "$SLOT" "$DATE_STAMP" ".dump.fc.age")"
  else
    DUMP_KEY="$(latest_dump_key "$SLOT")"
  fi
fi
if [ -z "$DUMP_KEY" ]; then
  die "no dump found in slot ${SLOT}"
fi

WORKDIR="$(mktemp -d)"
cleanup() { rm -rf "$WORKDIR"; }
trap cleanup EXIT

ENCRYPTED="$WORKDIR/dump.fc.age"
DUMP_FILE="$WORKDIR/dump.fc"
MANIFEST="$WORKDIR/manifest.json"
MANIFEST_KEY="$(latest_manifest_key "$DUMP_KEY")"

log_info "downloading dump" key="$DUMP_KEY" targetDb="$TARGET_DB" targetHost="$TARGET_HOST"
s3 cp "$(s3_uri "$DUMP_KEY")" "$ENCRYPTED" --only-show-errors
s3 cp "$(s3_uri "$MANIFEST_KEY")" "$MANIFEST" --only-show-errors
decrypt_file "$ENCRYPTED" "$DUMP_FILE"

if [ "$CREATE_DB" = "1" ]; then
  TARGET_DB_LITERAL="$(python3 "$BACKUP_ROOT/dbutil.py" quote-literal "$TARGET_DB")"
  TARGET_DB_IDENT="$(python3 "$BACKUP_ROOT/dbutil.py" quote-ident "$TARGET_DB")"
  exists="$(PGPASSWORD="$TARGET_PASSWORD" psql \
    -h "$TARGET_HOST" \
    -p "$TARGET_PORT" \
    -U "$TARGET_USER" \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -Atc "SELECT 1 FROM pg_database WHERE datname = ${TARGET_DB_LITERAL}")"
  if [ "$exists" = "1" ]; then
    die "target database ${TARGET_DB} already exists; pick another name or drop it first"
  fi
  PGPASSWORD="$TARGET_PASSWORD" psql \
    -h "$TARGET_HOST" \
    -p "$TARGET_PORT" \
    -U "$TARGET_USER" \
    -d postgres \
    -v ON_ERROR_STOP=1 \
    -c "CREATE DATABASE ${TARGET_DB_IDENT}"
fi

log_info "restoring dump" key="$DUMP_KEY" targetDb="$TARGET_DB"
PGPASSWORD="$TARGET_PASSWORD" pg_restore \
  -h "$TARGET_HOST" \
  -p "$TARGET_PORT" \
  -U "$TARGET_USER" \
  -d "$TARGET_DB" \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$DUMP_FILE"

EXPECTED="$WORKDIR/expected.json"
ACTUAL="$WORKDIR/actual.json"
python3 - "$MANIFEST" "$EXPECTED" <<'PY'
import json, pathlib, sys
manifest = json.loads(pathlib.Path(sys.argv[1]).read_text(encoding="utf-8"))
pathlib.Path(sys.argv[2]).write_text(json.dumps(manifest["rowCounts"], indent=2) + "\n", encoding="utf-8")
PY
collect_counts_json "$TARGET_HOST" "$TARGET_PORT" "$TARGET_USER" "$TARGET_PASSWORD" "$TARGET_DB" >"$ACTUAL"
python3 "$BACKUP_ROOT/dbutil.py" compare "$EXPECTED" "$ACTUAL"
log_info "restore verified" key="$DUMP_KEY" targetDb="$TARGET_DB"

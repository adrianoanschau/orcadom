#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
. "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/lib.sh"

# Isolated restore test: never talks to the live Postgres as a restore target.
# A disposable instance listens only on 127.0.0.1 inside this container.

mkdir -p "$BACKUP_METRICS_DIR"
exec 9>"$BACKUP_METRICS_DIR/restore-test.lock"
if ! flock -n 9; then
  die "another restore test is already running"
fi

WORKDIR="$(mktemp -d)"
RESTORE_PGDATA="$(mktemp -d /tmp/orcadom-restore-pgdata-XXXXXX)"
RESTORE_PORT="${BACKUP_RESTORE_TEST_PORT:-55432}"
RESTORE_USER="restore"
RESTORE_DB="orcadom_restore_test"
RESTORE_STOPPED=0

run_as_postgres() {
  if [ "$(id -u)" = "0" ]; then
    gosu postgres "$@"
  else
    "$@"
  fi
}

stop_disposable_postgres() {
  if [ "$RESTORE_STOPPED" = "1" ]; then
    return
  fi
  RESTORE_STOPPED=1
  if [ -d "$RESTORE_PGDATA" ]; then
    run_as_postgres pg_ctl -D "$RESTORE_PGDATA" -m immediate stop >/dev/null 2>&1 || true
  fi
  rm -rf "$RESTORE_PGDATA" "$WORKDIR"
}

trap stop_disposable_postgres EXIT

begin_job restore_test
wait_for_s3

DUMP_KEY="$(latest_dump_key daily)"
if [ -z "$DUMP_KEY" ]; then
  die "no daily dump found to test"
fi
MANIFEST_KEY="$(latest_manifest_key "$DUMP_KEY")"

ENCRYPTED="$WORKDIR/dump.fc.age"
DUMP_FILE="$WORKDIR/dump.fc"
MANIFEST="$WORKDIR/manifest.json"
s3 cp "$(s3_uri "$DUMP_KEY")" "$ENCRYPTED" --only-show-errors
s3 cp "$(s3_uri "$MANIFEST_KEY")" "$MANIFEST" --only-show-errors
decrypt_file "$ENCRYPTED" "$DUMP_FILE"

log_info "starting disposable postgres for restore test" port="$RESTORE_PORT" dataDir="$RESTORE_PGDATA"

if [ "$(id -u)" = "0" ]; then
  chown -R postgres:postgres "$RESTORE_PGDATA"
fi

run_as_postgres initdb \
  -D "$RESTORE_PGDATA" \
  --auth-local=trust \
  --auth-host=trust \
  --username="$RESTORE_USER" \
  >/dev/null

# listen_addresses=127.0.0.1: other Compose services cannot reach this instance.
run_as_postgres pg_ctl \
  -D "$RESTORE_PGDATA" \
  -o "-p ${RESTORE_PORT} -h 127.0.0.1 -k ${RESTORE_PGDATA}" \
  -w start \
  >/dev/null

unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD || true

createdb -h 127.0.0.1 -p "$RESTORE_PORT" -U "$RESTORE_USER" "$RESTORE_DB"

log_info "restoring latest dump into disposable postgres" key="$DUMP_KEY"
pg_restore \
  -h 127.0.0.1 \
  -p "$RESTORE_PORT" \
  -U "$RESTORE_USER" \
  -d "$RESTORE_DB" \
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

collect_counts_json "127.0.0.1" "$RESTORE_PORT" "$RESTORE_USER" "" "$RESTORE_DB" >"$ACTUAL"
python3 "$BACKUP_ROOT/dbutil.py" compare "$EXPECTED" "$ACTUAL"

log_info "restore test matched row counts" key="$DUMP_KEY"
finish_job

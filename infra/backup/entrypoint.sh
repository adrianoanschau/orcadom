#!/usr/bin/env bash
set -euo pipefail
# shellcheck source=lib.sh
. /backup/lib.sh

mkdir -p "$BACKUP_METRICS_DIR" "$BACKUP_KEYS_DIR"

write_aws_config() {
  local config="$BACKUP_METRICS_DIR/aws-config"
  cat >"$config" <<EOF
[default]
region = ${BACKUP_S3_REGION:-us-east-1}
s3 =
    addressing_style = path
    signature_version = s3v4
EOF
  export AWS_CONFIG_FILE="$config"
  export AWS_EC2_METADATA_DISABLED=true
}

ensure_keys() {
  local identity="$BACKUP_KEYS_DIR/identity.txt"
  if [ -n "${BACKUP_AGE_SECRET_KEY:-}" ] && [ ! -f "$identity" ]; then
    umask 077
    printf '%s\n' "$BACKUP_AGE_SECRET_KEY" >"$identity"
  fi
  if [ -z "${BACKUP_AGE_PUBLIC_KEY:-}" ]; then
    if [ ! -f "$identity" ]; then
      log_info "generating a local age key pair; replace this key before any real data is stored"
      age-keygen -o "$identity" >/tmp/age-keygen.out
    fi
    BACKUP_AGE_PUBLIC_KEY="$(awk '/public key:/{print $NF}' "$identity")"
    export BACKUP_AGE_PUBLIC_KEY
    log_info "using age public key" publicKey="$BACKUP_AGE_PUBLIC_KEY"
  fi
  if [ -z "${BACKUP_AGE_SECRET_KEY:-}" ] && [ -f "$identity" ]; then
    BACKUP_AGE_SECRET_KEY="$(grep '^AGE-SECRET-KEY' "$identity" || true)"
    export BACKUP_AGE_SECRET_KEY
  fi
  export BACKUP_AGE_PUBLIC_KEY="${BACKUP_AGE_PUBLIC_KEY:-}"
}

write_aws_config
ensure_keys
metrics init

if [ "$#" -gt 0 ]; then
  exec "$@"
fi

python3 /backup/metrics_server.py &

if [ "${BACKUP_RUN_ON_START:-true}" = "true" ]; then
  /backup/backup.sh || log_error "startup dump failed; container stays up so the failure remains visible"
fi
if [ "${BACKUP_RESTORE_TEST_ON_START:-false}" = "true" ]; then
  /backup/restore-test.sh || log_error "startup restore test failed; container stays up so the failure remains visible"
fi

printf '%s /backup/backup.sh >> /proc/1/fd/1 2>> /proc/1/fd/2\n' "${BACKUP_CRON:-0 3 * * *}" >/etc/crontabs/root
printf '%s /backup/restore-test.sh >> /proc/1/fd/1 2>> /proc/1/fd/2\n' "${BACKUP_RESTORE_TEST_CRON:-0 4 1 * *}" >>/etc/crontabs/root
log_info "starting backup scheduler" dumpCron="${BACKUP_CRON:-0 3 * * *}" restoreTestCron="${BACKUP_RESTORE_TEST_CRON:-0 4 1 * *}"
exec crond -f -l 8

#!/usr/bin/env bash
# =============================================================================
# destroy-preview.sh — remove o preview de um PR (containers, rota, banco).
# Caminho no repositório: infra/deploy/scripts/destroy-preview.sh
#
# Uso:  infra/deploy/scripts/destroy-preview.sh <N>
#
# Idempotente: pode rodar várias vezes, ou para um PR que nunca teve preview.
# Ordem: tira a rota do Caddy -> derruba containers/volume -> DROP DATABASE e
# DROP ROLE orcadom_pr_<N> -> apaga o estado e as imagens do PR.
# Nunca toca no banco de produção (nome validado).
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

[ $# -eq 1 ] || die "uso: $0 <N>"
PR="$1"
validate_pr_number "$PR"
require_env_file

BASE_DOMAIN="$(env_get PREVIEW_BASE_DOMAIN "$ENV_FILE")"; BASE_DOMAIN="${BASE_DOMAIN:-orcadom.aanschau.tech}"
PROD_DB="$(env_get POSTGRES_DB "$ENV_FILE")"; PROD_DB="${PROD_DB:-orcadom_db}"
PROD_USER="$(env_get POSTGRES_USER "$ENV_FILE")"; PROD_USER="${PROD_USER:-orcadom}"
NAME="orcadom_pr_${PR}"
STATE_DIR="$PREVIEWS_DIR/pr-$PR"
PR_ENV="$STATE_DIR/.env"

# Trava de segurança: nunca derrubar algo de produção.
[[ "$NAME" =~ ^orcadom_pr_[0-9]+$ ]] || die "nome inesperado: $NAME"
if [ "$NAME" = "$PROD_DB" ] || [ "$NAME" = "$PROD_USER" ]; then
  die "nome colide com produção."
fi

with_lock

# --- 1. Remove a rota (Caddy passa a responder 404 e não emite mais TLS) -----
rm -f "$ACTIVE_DIR/pr-$PR.$BASE_DOMAIN" "$ACTIVE_DIR/api-pr-$PR.$BASE_DOMAIN"

# --- 2. Containers + volume de relatórios --------------------------------------
if [ -f "$PR_ENV" ]; then
  docker compose -p "orcadom-pr-$PR" --env-file "$PR_ENV" \
    -f "$DEPLOY_DIR/docker-compose.preview.yml" --profile tools \
    down -v --remove-orphans --timeout 20 || true
fi
# Garantia extra caso o .env do preview tenha sumido.
docker rm -f "orcadom-pr-$PR-web" "orcadom-pr-$PR-api" >/dev/null 2>&1 || true
docker volume rm "orcadom_pr_${PR}_reports" >/dev/null 2>&1 || true

# --- 3. Banco e usuário ------------------------------------------------------
if docker inspect "$PG_CONTAINER" >/dev/null 2>&1; then
  log "Removendo banco e usuário $NAME…"
  pg_admin <<SQL
\set role '$NAME'
SELECT format('DROP DATABASE IF EXISTS %I WITH (FORCE)', :'role')\gexec
SELECT format('DROP ROLE IF EXISTS %I', :'role')\gexec
SQL
else
  log "AVISO: container $PG_CONTAINER não encontrado; banco não removido."
fi

# --- 4. Estado local e imagens do PR -----------------------------------------
case "$STATE_DIR" in
  "$PREVIEWS_DIR"/pr-[0-9]*) rm -rf -- "$STATE_DIR" ;;
  *) die "caminho de estado inesperado: $STATE_DIR" ;;
esac
docker images --format '{{.Repository}}:{{.Tag}}' \
  | grep -E ":pr-${PR}(-|$)" \
  | xargs -r docker rmi >/dev/null 2>&1 || true

log "Preview do PR #$PR removido."

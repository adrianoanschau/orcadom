#!/usr/bin/env bash
# =============================================================================
# deploy-preview.sh — cria/atualiza o preview de um PR (web + api, sem n8n).
# Caminho no repositório: infra/deploy/scripts/deploy-preview.sh
#
# Uso:
#   infra/deploy/scripts/deploy-preview.sh <N> <IMAGE_TAG>
#   infra/deploy/scripts/deploy-preview.sh --check <N>   # só verifica vaga
#
# Ex.:  infra/deploy/scripts/deploy-preview.sh 12 pr-12-3f2a1b9
#
# Resultado: https://pr-<N>.orcadom.aanschau.tech  (web)
#            https://api-pr-<N>.orcadom.aanschau.tech (api, Swagger em /api/docs)
#
# Códigos de saída: 0 ok | 75 limite de previews atingido | outros = erro.
#
# Idempotente: rodar de novo (push no PR) só troca a imagem e aplica as
# migrations novas. Banco e usuário são criados só se não existirem; o seed
# sintético (seed-staging) roda apenas na criação do banco.
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

usage() { die "uso: $0 <N> <IMAGE_TAG>  |  $0 --check <N>"; }

CHECK_ONLY=false
if [ "${1:-}" = "--check" ]; then
  CHECK_ONLY=true
  PR="${2:-}"
  [ $# -eq 2 ] || usage
else
  [ $# -eq 2 ] || usage
  PR="$1"
  TAG="$2"
  validate_image_tag "$TAG"
fi
validate_pr_number "$PR"
require_env_file

MAX_PREVIEWS="$(env_get PREVIEW_MAX "$ENV_FILE")"; MAX_PREVIEWS="${MAX_PREVIEWS:-2}"
BASE_DOMAIN="$(env_get PREVIEW_BASE_DOMAIN "$ENV_FILE")"; BASE_DOMAIN="${BASE_DOMAIN:-orcadom.aanschau.tech}"
SEED_ENABLED="$(env_get PREVIEW_SEED "$ENV_FILE")"; SEED_ENABLED="${SEED_ENABLED:-true}"
GHCR_IMAGE_PREFIX="$(env_get GHCR_IMAGE_PREFIX "$ENV_FILE")"
PROD_DB="$(env_get POSTGRES_DB "$ENV_FILE")"; PROD_DB="${PROD_DB:-orcadom_db}"

NAME="orcadom_pr_${PR}"          # banco E usuário do preview
STATE_DIR="$PREVIEWS_DIR/pr-$PR"
PR_ENV="$STATE_DIR/.env"
WEB_HOST="pr-$PR.$BASE_DOMAIN"
API_HOST="api-pr-$PR.$BASE_DOMAIN"

[ "$NAME" != "$PROD_DB" ] || die "nome do banco do preview colide com produção."

# Conta previews existentes (diretórios pr-*), exceto o próprio PR.
count_others() {
  local n=0 d
  for d in "$PREVIEWS_DIR"/pr-*; do
    [ -d "$d" ] || continue
    [ "$d" = "$STATE_DIR" ] && continue
    n=$((n + 1))
  done
  echo "$n"
}

check_slot() {
  local others
  others="$(count_others)"
  if [ ! -d "$STATE_DIR" ] && [ "$others" -ge "$MAX_PREVIEWS" ]; then
    log "LIMITE: já existem $others previews ativos (máximo $MAX_PREVIEWS):"
    for d in "$PREVIEWS_DIR"/pr-*; do
      if [ -d "$d" ]; then log "  - ${d##*/}"; fi
    done
    log "Feche/mergeie um PR (ou rode destroy-preview.sh <N>) e reexecute."
    exit "$EXIT_LIMIT"
  fi
}

mkdir -p "$ACTIVE_DIR"

if [ "$CHECK_ONLY" = true ]; then
  check_slot
  log "Há vaga para o preview do PR #$PR."
  exit 0
fi

with_lock
check_slot   # de novo, já com o lock (evita corrida entre dois PRs)

[ -n "$GHCR_IMAGE_PREFIX" ] || die "GHCR_IMAGE_PREFIX vazio em $ENV_FILE."
docker network inspect orcadom_backend >/dev/null 2>&1 \
  || die "rede orcadom_backend não existe — rode deploy-prod.sh primeiro."
wait_postgres

# --- 1. Estado do preview (segredos próprios, gerados uma única vez) ---------
mkdir -p "$STATE_DIR"
chmod 700 "$STATE_DIR"
umask 077
if [ ! -f "$PR_ENV" ]; then
  log "Gerando segredos do preview PR #$PR…"
  {
    echo "PR_NUMBER=$PR"
    echo "PREVIEW_DB_PASSWORD=$(gen_secret 24)"
    echo "PREVIEW_JWT_ACCESS_SECRET=$(gen_secret 32)"
    echo "PREVIEW_JWT_REFRESH_SECRET=$(gen_secret 32)"
  } > "$PR_ENV"
fi
DB_PASSWORD="$(env_get PREVIEW_DB_PASSWORD "$PR_ENV")"
# Campos que podem mudar a cada deploy: reescritos sempre.
sed -i -e '/^IMAGE_TAG=/d' -e '/^GHCR_IMAGE_PREFIX=/d' -e '/^PREVIEW_BASE_DOMAIN=/d' \
       -e '/^PREVIEW_DATABASE_URL=/d' "$PR_ENV"
{
  echo "IMAGE_TAG=$TAG"
  echo "GHCR_IMAGE_PREFIX=$GHCR_IMAGE_PREFIX"
  echo "PREVIEW_BASE_DOMAIN=$BASE_DOMAIN"
  echo "PREVIEW_DATABASE_URL=postgresql://$NAME:$DB_PASSWORD@postgres:5432/$NAME?schema=public"
} >> "$PR_ENV"
chmod 600 "$PR_ENV"

compose_pr() {
  docker compose -p "orcadom-pr-$PR" --env-file "$PR_ENV" \
    -f "$DEPLOY_DIR/docker-compose.preview.yml" "$@"
}

# --- 2. Usuário + banco isolados ---------------------------------------------
# Usuário sem superuser/createdb/createrole, dono apenas do próprio banco.
# A senha vai pelo stdin (\set), não aparece em `ps`.
DB_EXISTED="$(printf "SELECT 1 FROM pg_database WHERE datname = '%s';\n" "$NAME" \
  | docker exec -i "$PG_CONTAINER" sh -c 'psql -X -tA -U "$POSTGRES_USER" -d postgres')"
log "Garantindo usuário e banco $NAME…"
pg_admin <<SQL
\set role '$NAME'
\set pw '$DB_PASSWORD'
SELECT format('CREATE ROLE %I LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 15', :'role')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'role')\gexec
ALTER ROLE :"role" WITH LOGIN PASSWORD :'pw';
SELECT format('CREATE DATABASE %I OWNER %I', :'role', :'role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'role')\gexec
REVOKE ALL ON DATABASE :"role" FROM PUBLIC;
GRANT CONNECT, TEMPORARY ON DATABASE :"role" TO :"role";
REVOKE CONNECT ON DATABASE "$PROD_DB" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
SQL

# --- 3. Imagens + migrations ----------------------------------------------------
log "Baixando imagens $TAG…"
compose_pr --profile tools pull --quiet
log "Aplicando migrations em $NAME…"
compose_pr --profile tools run --rm preview-migrate

if [ "$DB_EXISTED" != "1" ] && [ "$SEED_ENABLED" = "true" ]; then
  log "Banco novo: rodando seed sintético (seed-staging)…"
  compose_pr --profile tools run --rm preview-migrate \
    node_modules/.bin/tsx prisma/seed-staging.ts \
    || log "AVISO: seed falhou (o preview sobe mesmo assim)."
fi

# --- 4. Sobe web + api ---------------------------------------------------------
log "Subindo containers do preview…"
compose_pr up -d --wait --wait-timeout 240 --remove-orphans

# --- 5. Registra a rota (o Caddy passa a aceitar TLS e tráfego) --------------
touch "$ACTIVE_DIR/$WEB_HOST" "$ACTIVE_DIR/$API_HOST"

# Aquece o certificado on-demand (primeira requisição dispara a emissão).
if curl -fsS -o /dev/null --max-time 60 --resolve "$WEB_HOST:443:127.0.0.1" "https://$WEB_HOST/login"; then
  log "OK  https://$WEB_HOST"
else
  log "AVISO: https://$WEB_HOST ainda não respondeu (emissão de certificado em andamento?)."
fi

log "Preview PR #$PR pronto: https://$WEB_HOST  (API: https://$API_HOST)"
# Última linha no stdout: URL (o workflow lê isso para comentar no PR).
echo "https://$WEB_HOST"

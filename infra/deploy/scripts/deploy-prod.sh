#!/usr/bin/env bash
# =============================================================================
# deploy-prod.sh — deploy de PRODUÇÃO do Orcadom no VPS.
# Caminho no repositório: infra/deploy/scripts/deploy-prod.sh
#
# Uso:   infra/deploy/scripts/deploy-prod.sh <IMAGE_TAG>
# Ex.:   infra/deploy/scripts/deploy-prod.sh sha-3f2a1b9c0d4e
# Rollback: rode de novo com a tag anterior (cat .env.image.prev).
#           Atenção: migrations não são revertidas (use expand/contract).
#
# Passos (idempotente — pode rodar de novo sem efeito colateral):
#   1. valida .env  2. pull das imagens  3. sobe o Postgres
#   4. endurece permissões do banco de produção
#   5. `prisma migrate deploy` DENTRO do VPS (container migrate)
#   6. `compose up -d --wait`  7. grava a tag em uso  8. smoke test  9. prune
# =============================================================================
set -euo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

TAG="${1:-}"
validate_image_tag "$TAG"
require_env_file
with_lock
cd "$REPO_DIR"

# --- 1. Validação mínima do .env ---------------------------------------------
for key in GHCR_IMAGE_PREFIX POSTGRES_PASSWORD DATABASE_URL JWT_ACCESS_SECRET \
           JWT_REFRESH_SECRET WEB_ORIGIN ACME_EMAIL AUTOMATION_API_KEY; do
  value="$(env_get "$key" "$ENV_FILE")"
  [ -n "$value" ] || die "variável $key vazia em $ENV_FILE."
  case "$value" in *troque*|*CHANGE_ME*) die "variável $key ainda tem valor de exemplo." ;; esac
done

mkdir -p "$ACTIVE_DIR"   # o Caddy monta este diretório (precisa existir)

# A tag nova vale para este processo; só é gravada em .env.image no sucesso.
export IMAGE_TAG="$TAG"
log "Deploy de produção com IMAGE_TAG=$IMAGE_TAG"

# --- 2. Pull (o servidor nunca builda) ---------------------------------------
log "Baixando imagens…"
compose_prod --profile tools pull --quiet

# --- 3. Postgres ---------------------------------------------------------------
log "Subindo o Postgres…"
compose_prod up -d --wait postgres
wait_postgres

# --- 4. Endurecimento: só o superusuário conecta nos bancos de produção ------
# Usuários de preview (orcadom_pr_<N>) nunca recebem CONNECT nesses bancos.
PROD_DB="$(env_get POSTGRES_DB "$ENV_FILE")"
PROD_DB="${PROD_DB:-orcadom_db}"
pg_admin <<SQL
REVOKE CONNECT ON DATABASE "$PROD_DB" FROM PUBLIC;
REVOKE CONNECT ON DATABASE postgres FROM PUBLIC;
SQL

# --- 5. Migrations dentro do VPS -----------------------------------------------
log "Aplicando migrations (prisma migrate deploy)…"
compose_prod --profile tools run --rm migrate

# --- 6. Sobe/atualiza a stack ------------------------------------------------
log "Atualizando containers…"
compose_prod up -d --wait --wait-timeout 300

# --- 7. Grava a tag em uso (com histórico para rollback) ---------------------
[ -f "$IMAGE_ENV_FILE" ] && cp "$IMAGE_ENV_FILE" "$IMAGE_ENV_FILE.prev"
printf 'IMAGE_TAG=%s\n' "$IMAGE_TAG" > "$IMAGE_ENV_FILE"

# --- 8. Smoke test pelo próprio Caddy (sem depender de DNS/hairpin) ----------
WEB_HOST="$(env_get PROD_WEB_HOST "$ENV_FILE")"; WEB_HOST="${WEB_HOST:-orcadom.aanschau.tech}"
API_HOST="$(env_get PROD_API_HOST "$ENV_FILE")"; API_HOST="${API_HOST:-api.orcadom.aanschau.tech}"
for url in "https://$WEB_HOST/login" "https://$API_HOST/"; do
  host="${url#https://}"; host="${host%%/*}"
  if curl -fsS -o /dev/null --max-time 30 --resolve "$host:443:127.0.0.1" "$url"; then
    log "OK  $url"
  else
    log "AVISO: $url não respondeu 2xx (certificado ainda sendo emitido?)."
  fi
done

# --- 9. Limpeza de imagens antigas não usadas (> 7 dias) ---------------------
docker image prune -af --filter "until=168h" >/dev/null || true

log "Deploy de produção concluído: $IMAGE_TAG"

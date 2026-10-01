#!/usr/bin/env bash
# shellcheck disable=SC2034  # variáveis usadas pelos scripts que fazem source
# =============================================================================
# lib.sh — funções compartilhadas pelos scripts de deploy do Orcadom.
# Caminho no repositório: infra/deploy/scripts/lib.sh
# Não execute direto: é carregado via `source` pelos outros scripts.
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"          # infra/deploy
REPO_DIR="$(cd "$DEPLOY_DIR/../.." && pwd)"         # /opt/orcadom
ENV_FILE="$REPO_DIR/.env"                           # segredos de produção
IMAGE_ENV_FILE="$REPO_DIR/.env.image"               # IMAGE_TAG em uso (gerado)
PREVIEWS_DIR="${PREVIEWS_DIR:-$REPO_DIR/previews}"  # estado dos previews
ACTIVE_DIR="$PREVIEWS_DIR/active"                   # marcadores lidos pelo Caddy
LOCK_FILE="$REPO_DIR/.deploy.lock"
PG_CONTAINER="orcadom-postgres"
CADDY_CONTAINER="orcadom-caddy"
CADDY_SITES_DIR="/opt/caddy/sites"                  # sites extras do VPS

# Código de saída usado quando o limite de previews é atingido.
EXIT_LIMIT=75

log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*" >&2; }
die() { log "ERRO: $1"; exit "${2:-1}"; }

# Lê uma chave de um arquivo .env sem executar o arquivo (sem `source`).
# Uso: env_get CHAVE arquivo
env_get() {
  local key="$1" file="$2"
  [ -f "$file" ] || return 0
  sed -n "s/^${key}=//p" "$file" | tail -n1 \
    | sed -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/"
}

# Serializa deploys (prod e previews): 1 vCPU / 4 GB não aguentam paralelo.
with_lock() {
  exec 9>"$LOCK_FILE"
  if ! flock -w 900 9; then
    die "outro deploy está em andamento há mais de 15 minutos."
  fi
}

require_env_file() {
  [ -f "$ENV_FILE" ] || die "arquivo $ENV_FILE não encontrado (veja SERVIDOR.md)."
}

# docker compose da produção (base + override prod, profile deps).
compose_prod() {
  local args=(--env-file "$ENV_FILE")
  [ -f "$IMAGE_ENV_FILE" ] && args+=(--env-file "$IMAGE_ENV_FILE")
  docker compose "${args[@]}" \
    -f "$DEPLOY_DIR/docker-compose.yml" \
    -f "$DEPLOY_DIR/docker-compose.prod.yml" \
    --profile deps "$@"
}

# Espera o Postgres de produção ficar healthy.
wait_postgres() {
  local _ status
  for _ in $(seq 1 60); do
    status="$(docker inspect -f '{{.State.Health.Status}}' "$PG_CONTAINER" 2>/dev/null || true)"
    [ "$status" = "healthy" ] && return 0
    sleep 2
  done
  die "Postgres ($PG_CONTAINER) não ficou healthy. Rode deploy-prod.sh primeiro."
}

# Executa SQL (lido do stdin) como superusuário dentro do container do
# Postgres, via socket local — nenhuma porta é exposta.
pg_admin() {
  local pg_user
  pg_user="$(env_get POSTGRES_USER "$ENV_FILE")"
  docker exec -i "$PG_CONTAINER" \
    psql -X -q -v ON_ERROR_STOP=1 -U "${pg_user:-orcadom}" -d postgres
}

validate_pr_number() {
  [[ "${1:-}" =~ ^[1-9][0-9]{0,5}$ ]] || die "número de PR inválido: '${1:-}'"
}

validate_image_tag() {
  [[ "${1:-}" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$ ]] || die "tag de imagem inválida: '${1:-}'"
}

# Gera segredo hexadecimal (seguro em URL, sem escapes).
gen_secret() { openssl rand -hex "${1:-32}"; }

# Garante que o Caddy está rodando com o Caddyfile atual do clone.
# Montagem de arquivo + `git checkout` = container vendo o arquivo antigo; por
# isso compara o hash do host com o de dentro do container.
caddy_apply() {
  local host_sum ctr_sum out
  host_sum="$(sha256sum "$DEPLOY_DIR/Caddyfile" | cut -d' ' -f1)"
  ctr_sum="$(docker exec "$CADDY_CONTAINER" sha256sum /etc/caddy/Caddyfile 2>/dev/null | cut -d' ' -f1 || true)"
  if [ "$host_sum" = "$ctr_sum" ]; then
    out="$(docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile 2>&1)" \
      || { printf '%s\n' "$out" | tail -n 5 >&2
           log "AVISO: caddy reload falhou (Caddy segue com a config anterior)."; }
    return 0
  fi
  log "Caddyfile mudou — validando antes de recriar o Caddy…"
  out="$(compose_prod run --rm --no-deps -T caddy \
    caddy validate --config /etc/caddy/Caddyfile 2>&1)" \
    || { printf '%s\n' "$out" | tail -n 5 >&2
         die "Caddyfile inválido; o Caddy continua com a versão anterior."; }
  compose_prod up -d --no-deps --force-recreate caddy
  log "Caddy recriado com o Caddyfile novo."
}

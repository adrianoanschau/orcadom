#!/usr/bin/env bash
# =============================================================================
# ssh-gate.sh — "forced command" da chave SSH do GitHub Actions.
# Caminho no repositório: infra/deploy/scripts/ssh-gate.sh
#
# Em ~/.ssh/authorized_keys do usuário `deploy` ficam DUAS chaves do Actions:
#   restrict,command="/opt/orcadom/infra/deploy/scripts/ssh-gate.sh prod" ssh-ed25519 AAAA... gha-orcadom-prod
#   restrict,command="/opt/orcadom/infra/deploy/scripts/ssh-gate.sh preview" ssh-ed25519 AAAA... gha-orcadom-preview
#
# Modo `prod` (environment production, só branch main) aceita tudo abaixo.
# Modo `preview` (environment preview, usado por PRs) aceita só
# deploy-preview, destroy-preview e status — uma chave de preview vazada não
# consegue fazer deploy de produção nem mexer no clone.
#
# Comandos:
#   update-repo <sha40>             atualiza o clone /opt/orcadom para o commit
#   deploy-prod <tag>
#   deploy-preview <N> <tag>
#   deploy-preview --check <N>
#   destroy-preview <N>
#   status
# =============================================================================
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "$SCRIPT_DIR/../../.." && pwd)"

MODE="${1:-}"
case "$MODE" in
  prod|preview) ;;
  *) echo "ssh-gate: modo inválido (use 'prod' ou 'preview')" >&2; exit 126 ;;
esac

read -r -a argv <<<"${SSH_ORIGINAL_COMMAND:-}"
cmd="${argv[0]:-}"
logger -t orcadom-deploy "ssh-gate[$MODE]: ${SSH_ORIGINAL_COMMAND:-<vazio>}" 2>/dev/null || true

if [ "$MODE" = "preview" ]; then
  case "$cmd" in
    deploy-preview|destroy-preview|status) ;;
    *) echo "comando não permitido para a chave de preview: '${cmd}'" >&2; exit 126 ;;
  esac
fi

case "$cmd" in
  update-repo)
    if [ "${#argv[@]}" -ne 2 ] || [[ ! "${argv[1]}" =~ ^[0-9a-f]{40}$ ]]; then
      echo "uso: update-repo <sha de 40 caracteres>" >&2; exit 64
    fi
    git -C "$REPO_DIR" fetch --quiet origin main
    git -C "$REPO_DIR" merge-base --is-ancestor "${argv[1]}" origin/main \
      || { echo "commit ${argv[1]} não está em origin/main" >&2; exit 65; }
    git -C "$REPO_DIR" checkout --quiet --force --detach "${argv[1]}"
    echo "repo em $(git -C "$REPO_DIR" rev-parse --short HEAD)"
    ;;
  deploy-prod)
    [ "${#argv[@]}" -eq 2 ] || { echo "uso: deploy-prod <tag>" >&2; exit 64; }
    exec "$SCRIPT_DIR/deploy-prod.sh" "${argv[1]}"
    ;;
  deploy-preview)
    [ "${#argv[@]}" -eq 3 ] || { echo "uso: deploy-preview <N> <tag> | --check <N>" >&2; exit 64; }
    exec "$SCRIPT_DIR/deploy-preview.sh" "${argv[1]}" "${argv[2]}"
    ;;
  destroy-preview)
    [ "${#argv[@]}" -eq 2 ] || { echo "uso: destroy-preview <N>" >&2; exit 64; }
    exec "$SCRIPT_DIR/destroy-preview.sh" "${argv[1]}"
    ;;
  status)
    docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Image}}'
    ls -1 "$REPO_DIR/previews/active" 2>/dev/null || true
    ;;
  *)
    echo "comando não permitido: '${cmd}'" >&2
    exit 126
    ;;
esac

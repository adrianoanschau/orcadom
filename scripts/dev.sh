#!/usr/bin/env bash
# Sobe o Orcadom em abas do terminal atual (tmux).
# Uso: ./scripts/dev.sh [--n8n]
# Troca de aba: Ctrl+b n   |   aba anterior: Ctrl+b p
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export PATH="${HOME}/.local/bin:${PATH}"

if [[ -f "${ROOT}/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "${ROOT}/.env"
  set +a
fi

API_PORT="${PORT:-8080}"
WEB_PORT="3000"
WITH_N8N=0
SESSION="orcadom-dev"

for arg in "$@"; do
  case "$arg" in
    --n8n) WITH_N8N=1 ;;
    -h | --help)
      echo "Uso: $0 [--n8n]"
      echo "  Libera as portas da API (${API_PORT}) e do web (${WEB_PORT}),"
      echo "  sobe o Postgres e abre uma aba tmux para cada app nesta janela."
      echo "  Troca de aba: Ctrl+b n"
      exit 0
      ;;
    *)
      echo "Opção desconhecida: $arg" >&2
      exit 1
      ;;
  esac
done

pids_on_port() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${port}/tcp" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' || true
    return
  fi
  ss -tlnp "sport = :${port}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u || true
}

free_port() {
  local port="$1"
  local pids
  pids="$(pids_on_port "${port}" | tr '\n' ' ')"
  if [[ -z "${pids// /}" ]]; then
    echo "Porta ${port} livre."
    return
  fi
  echo "Encerrando processos na porta ${port}: ${pids}"
  # shellcheck disable=SC2086
  kill ${pids} 2>/dev/null || true
  sleep 0.4
  pids="$(pids_on_port "${port}" | tr '\n' ' ')"
  if [[ -n "${pids// /}" ]]; then
    # shellcheck disable=SC2086
    kill -9 ${pids} 2>/dev/null || true
  fi
}

write_runner() {
  local title="$1"
  local command="$2"
  local script
  script="$(mktemp "${TMPDIR:-/tmp}/orcadom-dev.XXXXXX.sh")"

  cat > "${script}" <<EOF
#!/usr/bin/env bash
export PATH="\${HOME}/.local/bin:\${PATH}"
cd $(printf '%q' "${ROOT}")
printf '\\033]0;%s\\007' $(printf '%q' "${title}")
echo "==> ${title}"
${command}
status=\$?
echo
echo "Saiu com código \${status}. Enter para fechar."
read -r
EOF
  chmod +x "${script}"
  printf '%s' "${script}"
}

spawn_window() {
  local title="$1"
  local script="$2"
  if command -v deepin-terminal >/dev/null 2>&1; then
    nohup deepin-terminal --title "${title}" -w "${ROOT}" --keep-open -e "bash ${script}" >/dev/null 2>&1 &
    disown
    return
  fi
  if command -v gnome-terminal >/dev/null 2>&1; then
    nohup gnome-terminal --title="${title}" --working-directory="${ROOT}" -- bash "${script}" >/dev/null 2>&1 &
    disown
    return
  fi
  echo "Nem tmux nem um emulador de terminal gráfico foram encontrados." >&2
  exit 1
}

echo "Liberando portas da API e do web…"
free_port "${API_PORT}"
free_port "${WEB_PORT}"

echo "Subindo Postgres…"
docker compose up -d postgres

if [[ "${WITH_N8N}" -eq 1 ]]; then
  echo "Subindo n8n…"
  docker compose up -d n8n
fi

API_SCRIPT="$(write_runner "Orcadom API :${API_PORT}" "pnpm --filter @orcadom/api dev")"
WEB_SCRIPT="$(write_runner "Orcadom Web :${WEB_PORT}" "pnpm --filter @orcadom/web dev")"

echo
echo "API  → http://127.0.0.1:${API_PORT}"
echo "Web  → http://127.0.0.1:${WEB_PORT}"
if [[ "${WITH_N8N}" -eq 1 ]]; then
  echo "n8n  → http://127.0.0.1:${N8N_PORT:-5678}"
fi

if ! command -v tmux >/dev/null 2>&1; then
  echo
  echo "tmux não encontrado; abrindo janelas separadas."
  spawn_window "Orcadom API :${API_PORT}" "${API_SCRIPT}"
  sleep 0.5
  spawn_window "Orcadom Web :${WEB_PORT}" "${WEB_SCRIPT}"
  exit 0
fi

if [[ -n "${TMUX:-}" ]]; then
  echo
  echo "Abrindo abas nesta sessão tmux (api / web). Troca: Ctrl+b n"
  tmux new-window -n api "bash ${API_SCRIPT}"
  tmux new-window -n web "bash ${WEB_SCRIPT}"
  exit 0
fi

echo
echo "Abrindo abas nesta janela (tmux). Troca: Ctrl+b n"
if tmux has-session -t "${SESSION}" 2>/dev/null; then
  tmux kill-session -t "${SESSION}"
fi

exec tmux new-session -s "${SESSION}" -n api "bash ${API_SCRIPT}" \; \
  set-option -t "${SESSION}" mouse on \; \
  new-window -n web "bash ${WEB_SCRIPT}" \; \
  select-window -t "${SESSION}:api"

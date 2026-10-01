# Orcadom — preparação do VPS (produção + previews)

VPS Hostinger KVM 1 · Ubuntu 24.04 · IP `179.236.230.240` · usuário `deploy`
App em `/opt/orcadom` (clone do repositório). O servidor **nunca builda**:
só `docker pull` de `ghcr.io/adrianoanschau/orcadom/{api,web,migrate}`.

> Faça antes: aplique o `PROMPT_CURSOR.md` no repositório e faça merge na
> `main` com `DEPLOY_ENABLED` **diferente de** `true` nos environments. O
> primeiro push na `main` publica as imagens `sha-<12>` e `main` no GHCR.

---

## 0. Conferências rápidas

```bash
# DNS (o wildcard NÃO cobre o próprio orcadom.aanschau.tech nem n8n.aanschau.tech)
for h in orcadom.aanschau.tech api.orcadom.aanschau.tech pr-1.orcadom.aanschau.tech n8n.aanschau.tech; do
  printf '%-32s %s\n' "$h" "$(dig +short "$h" | tail -n1)"
done   # todos devem mostrar 179.236.230.240

docker compose version     # precisa ser >= 2.24.4 (suporte a !reset)
id deploy                  # deve listar os grupos sudo e docker
sudo ufw status            # só 22, 80, 443
```

Opcional (recomendado com 4 GB): menos agressividade de swap.

```bash
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-orcadom.conf && sudo sysctl --system
```

## 1. Clone em /opt/orcadom

```bash
sudo mkdir -p /opt/orcadom && sudo chown deploy:deploy /opt/orcadom
git clone https://github.com/adrianoanschau/orcadom.git /opt/orcadom
cd /opt/orcadom
chmod +x infra/deploy/scripts/*.sh
mkdir -p previews/active

# Sites extras do VPS (fora do Orcadom; ver seção 11). Tem que existir e ser
# do `deploy` antes do primeiro `up` — senão o Docker cria como root.
sudo mkdir -p /opt/caddy/sites && sudo chown -R deploy:deploy /opt/caddy
```

## 2. Criar o `.env` de produção

```bash
cd /opt/orcadom
cp infra/deploy/.env.production.example .env
chmod 600 .env

# Gera os segredos automaticamente
PG="$(openssl rand -hex 24)"
sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG}|" .env
sed -i "s|^DATABASE_URL=.*|DATABASE_URL=postgresql://orcadom:${PG}@postgres:5432/orcadom_db?schema=public|" .env
for k in JWT_ACCESS_SECRET JWT_REFRESH_SECRET AUTOMATION_API_KEY NOTIFICATIONS_WEBHOOK_SECRET; do
  sed -i "s|^${k}=.*|${k}=$(openssl rand -hex 32)|" .env
done
unset PG

# Chaves do Web Push (opcional; cole os valores em VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)
docker run --rm node:20-alpine npx -y web-push generate-vapid-keys

nano .env    # ACME_EMAIL, VAPID_*, VAPID_SUBJECT, N8N_VERSION (fixe uma versão)
grep -n 'CHANGE_ME' .env || echo "sem placeholders pendentes"
```

> Se já existir um volume `orcadom_pgdata` de outro teste, a senha do
> Postgres é a que foi usada na criação do volume — não a do `.env`.

## 3. Login no GHCR (token só com `read:packages`)

Crie em GitHub → Settings → Developer settings → **Personal access tokens
(classic)** um token com **apenas** `read:packages` (com validade; anote
quando expira).

```bash
read -rsp 'Token GHCR (read:packages): ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | docker login ghcr.io -u adrianoanschau --password-stdin
unset GHCR_TOKEN
docker pull ghcr.io/adrianoanschau/orcadom/api:main   # teste
```

## 4. Chaves SSH do GitHub Actions (duas, com comando forçado)

Uma chave para `production` (pode fazer deploy de produção) e outra para
`preview` (só cria/remove previews). As duas só executam o
`infra/deploy/scripts/ssh-gate.sh` — sem shell, sem port-forwarding.

```bash
cd ~
ssh-keygen -t ed25519 -N '' -C gha-orcadom-prod    -f ~/gha-orcadom-prod
ssh-keygen -t ed25519 -N '' -C gha-orcadom-preview -f ~/gha-orcadom-preview

GATE=/opt/orcadom/infra/deploy/scripts/ssh-gate.sh
{
  echo "restrict,command=\"$GATE prod\" $(cat ~/gha-orcadom-prod.pub)"
  echo "restrict,command=\"$GATE preview\" $(cat ~/gha-orcadom-preview.pub)"
} >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys

# Copie cada chave PRIVADA para o secret DEPLOY_SSH_KEY do environment certo:
cat ~/gha-orcadom-prod       # -> environment "production"
cat ~/gha-orcadom-preview    # -> environment "preview"

# Depois de salvar no GitHub, apague as privadas do servidor:
shred -u ~/gha-orcadom-prod ~/gha-orcadom-preview
```

`DEPLOY_KNOWN_HOSTS` (mesmo valor nos dois environments). Rode **no seu
computador** e confira a impressão digital com a do servidor:

```bash
# no seu computador
ssh-keyscan -t ed25519 179.236.230.240 2>/dev/null | tee known_hosts_orcadom
ssh-keygen -lf known_hosts_orcadom
# no VPS (tem que bater)
ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub
```

## 5. Primeiro deploy (manual)

Use a imagem do commit em que o clone está (publicada pelo workflow do push
na `main`):

```bash
cd /opt/orcadom
TAG="sha-$(git rev-parse HEAD | cut -c1-12)"
docker manifest inspect "ghcr.io/adrianoanschau/orcadom/api:$TAG" >/dev/null && echo "imagem ok: $TAG"
infra/deploy/scripts/deploy-prod.sh "$TAG"
```

O script: baixa as imagens → sobe o Postgres → revoga `CONNECT` público nos
bancos de produção → `prisma migrate deploy` no container `migrate` → `up -d
--wait` → grava a tag em `.env.image` → aplica o Caddyfile atual (veja
abaixo) → smoke test → prune.

> O Caddyfile é montado como arquivo: depois de um `git checkout` o
> container continuaria vendo a versão antiga. O `deploy-prod.sh` compara o
> hash do arquivo no host com o de dentro do container; se mudou, valida o
> novo (`caddy validate`) e recria só o Caddy; se não mudou, faz um
> `caddy reload` (no-op quando nada mudou).

## 6. Verificação

```bash
cd /opt/orcadom
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
# Só orcadom-caddy pode mostrar 0.0.0.0:80 e 0.0.0.0:443.

sudo ss -tlnp | grep -E ':(5432|5678|8080|3000)\b' || echo "nenhuma porta interna exposta (ok)"
docker stats --no-stream --format 'table {{.Name}}\t{{.MemUsage}}\t{{.CPUPerc}}'

curl -sSI https://orcadom.aanschau.tech/login | head -n1                     # HTTP/2 200
curl -sS  https://api.orcadom.aanschau.tech/                                 # {"name":"Orcadom API","status":"ok",...}
curl -s -o /dev/null -w '%{http_code}\n' https://api.orcadom.aanschau.tech/metrics   # 404 (bloqueado)
curl -sSI https://n8n.aanschau.tech | head -n1                               # 200
curl -sS -o /dev/null -w '%{http_code}\n' https://pr-999.orcadom.aanschau.tech  # falha de TLS (sem preview: ok)

docker logs --tail 50 orcadom-caddy
```

No seu computador, confirme que nada além de 22/80/443 responde:

```bash
nc -zv -w3 179.236.230.240 5432; nc -zv -w3 179.236.230.240 5678; nc -zv -w3 179.236.230.240 8080
```

## 7. n8n

1. Abra `https://n8n.aanschau.tech` e crie o usuário owner.
2. Importe `infra/n8n/email-import-workflow.json` e
   `infra/n8n/send-notification-workflow.json`.
3. A URL da API nos workflows é `{{ $env.ORCADOM_API_URL }}` → `http://api:8080`
   (rede interna). A credencial Header Auth usa `AUTOMATION_API_KEY` /
   `NOTIFICATIONS_WEBHOOK_SECRET` do `.env`.
4. No Google Cloud (OAuth do Gmail), adicione o redirect
   `https://n8n.aanschau.tech/rest/oauth2-credential/callback`.

## 8. Teste manual de preview (opcional, antes de ligar o Actions)

Usa a mesma imagem da produção só para validar banco/rota/TLS:

```bash
cd /opt/orcadom
infra/deploy/scripts/deploy-preview.sh 999 "$(sed -n 's/^IMAGE_TAG=//p' .env.image)"
curl -sSI https://pr-999.orcadom.aanschau.tech/login | head -n1
curl -sS  https://api-pr-999.orcadom.aanschau.tech/
docker exec orcadom-postgres psql -U orcadom -d postgres -c '\l orcadom_pr_*'
# login no preview (seed sintético): owner@staging.orcadom.local / staging-orcadom
infra/deploy/scripts/destroy-preview.sh 999
```

## 9. Ligar o GitHub Actions

Em GitHub → Settings → Environments:

| Environment | Branches | Variables | Secrets |
|---|---|---|---|
| `production` | só `main` | `DEPLOY_ENABLED=true` | `DEPLOY_HOST=179.236.230.240`, `DEPLOY_USER=deploy`, `DEPLOY_SSH_KEY` (chave prod), `DEPLOY_KNOWN_HOSTS` |
| `preview` | sem restrição | `DEPLOY_ENABLED=true` | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (chave preview), `DEPLOY_KNOWN_HOSTS` |

Os secrets antigos `DATABASE_URL` e `GHCR_PULL_TOKEN` deixam de ser usados
pelo Actions (o login no GHCR fica salvo no VPS) — pode removê-los.

## 10. Operação do dia a dia

```bash
cd /opt/orcadom
cat .env.image .env.image.prev 2>/dev/null           # tag atual / anterior
infra/deploy/scripts/deploy-prod.sh <tag-anterior>   # rollback (migrations não voltam)
ls previews/                                         # previews existentes (máx. 2)
infra/deploy/scripts/destroy-preview.sh <N>          # libera vaga manualmente
docker logs -f --tail 100 orcadom-api-1
docker compose --env-file .env --env-file .env.image \
  -f infra/deploy/docker-compose.yml -f infra/deploy/docker-compose.prod.yml \
  --profile deps ps
journalctl -t orcadom-deploy --since today           # comandos recebidos via SSH
```

Token do GHCR expirou? Repita o passo 3.

## 11. Sites extras do VPS (fora do Orcadom)

O Caddy do Orcadom é o único que publica 80/443, então outros sites
estáticos/containers do mesmo VPS entram por ele **sem mudar este repo**:
o `Caddyfile` termina com `import /etc/caddy/sites/*.caddy`, e o
`docker-compose.prod.yml` monta `/opt/caddy/sites` (host) em
`/etc/caddy/sites` (somente leitura).

- A pasta é criada no passo 1 (`sudo mkdir -p /opt/caddy/sites && sudo
  chown -R deploy:deploy /opt/caddy`); os arquivos são do usuário `deploy`.
  Pasta vazia não quebra o Caddy (só um aviso "No files matching import glob
  pattern" no log).
- Cada `<nome>.caddy` contém **só blocos de site** (sem bloco de opções
  globais e sem snippets com nomes já usados aqui). Pode usar `import comum`
  (os snippets do Caddyfile são definidos antes do import), mas prefira
  arquivos autocontidos, que não dependem do Orcadom.
- O container do site precisa estar na rede docker `orcadom_edge` (é a rede
  do proxy) e **não** publicar portas; no arquivo, use
  `reverse_proxy <container>:<porta>`.
- Depois de criar/alterar/apagar um arquivo, recarregue (sem downtime; se a
  config for inválida o Caddy recusa e mantém a anterior):

```bash
cd /opt/orcadom
docker compose --env-file .env --env-file .env.image \
  -f infra/deploy/docker-compose.yml -f infra/deploy/docker-compose.prod.yml \
  --profile deps exec caddy caddy reload --config /etc/caddy/Caddyfile
# atalho equivalente: docker exec orcadom-caddy caddy reload --config /etc/caddy/Caddyfile
docker logs --tail 30 orcadom-caddy
```

O `deploy-prod.sh` também faz esse reload a cada deploy.

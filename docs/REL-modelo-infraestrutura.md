# Modelo de infraestrutura

Desenho da infraestrutura do Orcadom, escrito para ser copiado num
projeto novo. Os nomes, domínios e segredos daqui são a implementação
de referência. O passo a passo desta máquina continua em
[`32-deploy-vps-previews.md`](./32-deploy-vps-previews.md) e
[`infra/deploy/SERVIDOR.md`](../infra/deploy/SERVIDOR.md).

## 1. O que o modelo entrega

Um monorepo com web e API, Postgres no mesmo host, imagens imutáveis
publicadas no GHCR e um VPS pequeno que só faz `docker pull`. O GitHub
Actions nunca fala com o banco. Produção só sobe no merge de um Release
PR. Preview de pull request sobe no mesmo VPS, com banco isolado, e
some quando o PR fecha.

```
feature ──► develop ──► PR contra main
                              │
                    CI (lint, build, test)
                    label preview? ──► VPS (máx. 2)
                              │
                         merge em main
                              │
                    Release PR (changesets)
                              │
                         merge do Release PR
                              │
              tag vX.Y.Z + imagens no GHCR
                              │
                    SSH (comando forçado) ──► VPS
                              │
                    migrate no host, depois compose up
```

## 2. Peças e onde vivem

| Peça | Neste repositório | No projeto novo |
| --- | --- | --- |
| Compose local | `docker-compose.yml` na raiz | mesmo lugar; não é o de produção |
| Compose de deploy | `infra/deploy/docker-compose.yml` + `docker-compose.prod.yml` | copiar o par e o override de preview |
| Proxy e TLS | `infra/deploy/Caddyfile` | trocar hosts e o padrão dos previews |
| Scripts do host | `infra/deploy/scripts/` | `ssh-gate`, `deploy-prod`, `deploy-preview`, `destroy-preview`, `lib` |
| Imagens | `apps/api/Dockerfile`, `apps/web/Dockerfile`, `packages/database/Dockerfile` | contexto na raiz do monorepo (`turbo prune`) |
| CI | `.github/workflows/ci.yml`, `commitlint.yml`, `changeset-check.yml` | gates de PR |
| Release | `release.yml`, `tag-release.yml`, `deploy-production.yml` | versão única do produto |
| Preview | `preview.yml` | label, teto de vagas, teardown |
| Backup | `infra/backup/` | profile opcional; dump fora do volume do Postgres |
| Observabilidade local | `infra/prometheus/`, `infra/grafana/` | profile opcional |

## 3. Máquina local

Dois composes, de propósito. O da raiz sobe o que o desenvolvedor
precisa. O de `infra/deploy/` só roda no VPS, puxando imagem do
registry. Misturar os dois faz o laptop buildar o que produção deveria
só baixar, ou publica porta de banco no servidor.

| Comando | Sobe |
| --- | --- |
| `pnpm db:up` | Postgres |
| `pnpm docker:up` | Postgres e o que for do dia a dia (aqui, o n8n) |
| `pnpm obs:up` | profile `observability` (GlitchTip, Prometheus, Grafana) |
| `pnpm backup:up` | profile `backup` (MinIO local + job de dump) |

Produção não usa esses profiles de observabilidade. Logs JSON, `/metrics`
e o SDK de erro (DSN do GlitchTip ou do Sentry) ficam na API mesmo
assim. O profile `backup` de produção aponta para S3 de verdade; o
MinIO é só o substituto local.

Node na versão do `engines`, pnpm pinado em `packageManager`. Variáveis
locais em `.env.example`. Exemplos de deploy em
`infra/deploy/.env.production.example`, separados do `.env` de
desenvolvimento.

## 4. Git, qualidade e versão

`main` não recebe push direto. O ruleset exige pull request. O trabalho
acumula em `develop`; a branch de feature sai de `develop`, para o PR
contra `main` levar junto o que já está lá. Um PR por entrega testável.

Antes do push, nesta máquina:

```bash
pnpm turbo run lint build test
```

É o mesmo comando do job `build-test`. Se a mudança mexe em backup,
entra também `pnpm test:backup`. O hook `pre-push` recusa o envio se
algum commit desde `origin/main` falhar no commitlint. Não usar
`--no-verify`.

Mensagem no padrão Conventional Commits: tipo, escopo opcional,
descrição em inglês, minúsculas, imperativo, sem ponto, no máximo 100
caracteres por linha. O hook `commit-msg` revisa a mensagem nova e o
intervalo desde `origin/main`.

A versão é uma só para o produto, no `package.json` da raiz. Os pacotes
internos não vão para o npm. No Changesets eles ficam no grupo `fixed`
de `.changeset/config.json` — pacote novo entra nessa lista, senão fica
de fora da tag.

| Mudança | Changeset |
| --- | --- |
| Funcionalidade visível | `minor` |
| Correção ou ajuste interno | `patch` |
| Quebra de contrato, a partir de `1.0.0` | `major` (em `0.x`, breaking pode ser `minor`) |
| Docs, CI, refactor sem efeito observável | label `no-changeset` |

Infraestrutura que o usuário não percebe não incrementa `MINOR`.

O merge em `main` não faz deploy. O workflow `release.yml` abre ou
atualiza o PR `chore: release` (`changeset-release/main`), que acumula
changesets até alguém decidir lançar. O token desse workflow é de um
GitHub App (`RELEASE_APP_ID` + `RELEASE_APP_PRIVATE_KEY`, Contents e
Pull requests em read/write), não o `GITHUB_TOKEN`. O token padrão não
dispara outros workflows: o Release PR sairia sem o check `build-test`
e o ruleset impediria o merge.

O merge desse PR muda a versão do `package.json` da raiz. O
`tag-release.yml` detecta essa diferença (vale merge commit, squash e
rebase), cria a tag `vX.Y.Z` se ela ainda não existe, publica as
imagens e chama o deploy. Tag e Release já existentes não falham o job.

## 5. Imagens

O Actions builda. O VPS só faz pull. Três imagens, contexto na raiz:

| Imagem | Dockerfile | Função |
| --- | --- | --- |
| `api` | `apps/api/Dockerfile` | HTTP |
| `web` | `apps/web/Dockerfile` | Next.js `output: 'standalone'` |
| `migrate` | `packages/database/Dockerfile` | `prisma migrate deploy`, sobe e sai |

Tags de produção: `vX.Y.Z` e `X.Y.Z`. Não há tag `:main` nem `sha-<12>`
em push comum. Tags de preview: `pr-<N>-<7 do SHA>` (imutável) e
`pr-<N>` (móvel). Registry: `ghcr.io/<owner>/<repo>/{api,web,migrate}`.

O web fala com a API por `/backend` na própria origem. `API_URL` é
runtime (`http://api:8080` em produção; no preview, o container daquele
PR). `NEXT_PUBLIC_API_URL=/backend` entra no build e a mesma imagem web
serve qualquer host. Cookie de sessão é host-only, sem `Domain`: o
preview não recebe o cookie de produção.

## 6. Um VPS, dois papéis

Referência: Hostinger KVM 1 (1 vCPU, 4 GB RAM, 2 GB swap), Ubuntu,
usuário `deploy`, clone em `/opt/<projeto>`. Swap com `vm.swappiness=10`.
Firewall do host: só 22, 80 e 443. O Docker ignora o ufw, então o
compose de produção zera as portas publicadas (`ports: !reset []`,
Compose ≥ 2.24.4) e só o Caddy publica 80 e 443.

```
Internet
   │  :80 / :443
   ▼
Caddy                          rede <projeto>_edge
   ├── web de produção
   ├── api de produção
   ├── serviços auxiliares (aqui, n8n)
   └── web e api de cada preview

rede <projeto>_backend         nenhuma porta publicada
   postgres · api · migrate · serviços que precisam do banco
```

DNS: hosts de produção explícitos (`app` e `api.app`). Wildcard de um
nível (`*.app.example`) cobre `pr-<N>` e `api-pr-<N>`. O wildcard não
alcança um host irmão fora desse domínio (aqui, `n8n.aanschau.tech` é
registro próprio).

TLS dos hosts fixos é automático. Previews usam TLS on demand: o Caddy
só pede certificado se o endpoint `ask` (`127.0.0.1:5555/ask`, dentro
do container) responder 200, e ele responde 200 só com o arquivo
`previews/active/<host>`. Os scripts criam e apagam esses arquivos. Não
há reload do Caddy para nascer ou morrer um preview.

Desde o Caddy 2.10, um wildcard na config impede o certificado
individual de um nome que ele cobre. Se a API de produção for
subdomínio desse wildcard, o bloco dela usa `tls force_automate`. O
`ask` continua liberando só preview com marcador.

Sites que não são deste repositório entram sem mudar o código: o
Caddyfile termina com `import /etc/caddy/sites/*.caddy`, montado de
`/opt/caddy/sites` no host. A pasta existe e pertence a `deploy` antes
do primeiro `up`. Cada arquivo é só bloco de site. O container do site
entra na rede `edge` e não publica porta.

Na API pública, `/metrics` e rotas internas (aqui, `/automation/*`)
respondem 404. O serviço auxiliar chama a API pela rede Docker.

## 7. Deploy e o que o GitHub nunca faz

Não há `DATABASE_URL` nos secrets do GitHub. A migration roda no
container `migrate`, no VPS, antes do `compose up`. O `.env` do clone
(`/opt/<projeto>/.env`, modo `600`) é a fonte dos segredos de runtime.
O login no GHCR fica no servidor (token classic só com `read:packages`).

Dois GitHub Environments, duas chaves SSH. As duas estão em
`authorized_keys` com `restrict` e forced command no `ssh-gate.sh`. Não
há shell nem port-forward.

| Environment | Branch | Chave aceita |
| --- | --- | --- |
| `production` | só `main` | `update-repo`, `deploy-prod`, e o resto |
| `preview` | sem restrição (o job roda em `refs/pull/N/merge`) | `deploy-preview`, `destroy-preview`, `status` |

Secrets de cada um: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY`,
`DEPLOY_KNOWN_HOSTS`. Variável `DEPLOY_ENABLED`: diferente de `true`, o
job avisa e sai verde. Imagem e tag continuam publicadas. A variável é
lida num step; não funciona em `jobs.<id>.if`.

Ordem para ligar:

1. Preparar o VPS com `DEPLOY_ENABLED` ainda desligado.
2. Criar os environments e colar host, usuário, chave e `known_hosts`.
3. Criar o GitHub App de release.
4. Merge do Release PR: publica imagens; o SSH é pulado.
5. Só então `DEPLOY_ENABLED=true`. O release seguinte faz o deploy. Uma
   tag que já está no GHCR sobe pelo `workflow_dispatch` de
   `deploy-production.yml` (Actions → Deploy produção, a partir de
   `main`, input `version`).

No host, `deploy-prod.sh` é idempotente: valida o `.env`, faz pull, sobe
o Postgres, revoga `CONNECT` de `PUBLIC` nos bancos de produção, roda a
migration, `compose up --wait`, grava a tag em `.env.image` (a anterior
em `.env.image.prev`), aplica o Caddyfile se o arquivo montado mudou,
smoke test, prune. `update-repo` só aceita SHA de 40 caracteres ou tag
`vX.Y.Z` que já seja ancestral de `origin/main`.

Rollback é o mesmo script com a tag anterior. A migration roda de novo
e não volta atrás. Mudança estrutural segue expand/contract: adicionar
o novo, migrar o dado, remover o antigo numa migration posterior.
Rollback de imagem não desfaz SQL.

Permissões do repositório: Actions em read and write (tag, GitHub
Release, GHCR). Pacotes já existentes no GHCR precisam de Write para
este repositório. Branch protection em `main` exige `build-test`,
`e2e-smoke`, `changeset-check` e `commitlint`.

## 8. Previews

O preview sobe só com a label `preview` no PR contra `main`. Abrir o PR
não publica nada. Tirar a label, ou fechar o PR, apaga containers, banco
e usuário. Não usa `pull_request_target`. Pula fork e o Release PR.

Máximo de 2 ao mesmo tempo (`PREVIEW_MAX` no `.env` do VPS). Sem vaga,
o script sai com código 75 e o workflow comenta no PR (marcador HTML
fixo, atualizado em vez de duplicado). A label é para funcionalidade
nova, correção observável ou fluxo de UI ou API. Documentação, regra de
editor, refactor sem comportamento novo e chore gastam vaga e RAM sem
necessidade.

O banco do preview é `<projeto>_pr_<N>`, usuário de mesmo nome, no
mesmo Postgres, sem ser superuser e sem `CONNECT` no banco de produção.
O seed sintético roda só na criação do banco. Preview aqui é só web e
API: o n8n fica de fora.

Concorrência do workflow: um grupo por número de PR, cancelando o run
anterior. O deploy de produção usa outro grupo e não cancela o que está
no meio.

## 9. Backup e observabilidade

Backup é `pg_dump -Fc`, cifrado com age, enviado para S3 (MinIO no
laptop, B2 ou AWS no host). A chave privada não vai para o bucket. A
retenção é avô-pai-filho: 7 diários, 4 semanais, 6 mensais. Um restore
test periódico sobe um Postgres descartável e compara a contagem de
linhas do manifest. Falha de dump não derruba o exporter: métrica, log
e evento de erro continuam visíveis. O volume de dados do Postgres
nunca recebe o dump.

No VPS de referência o profile `backup` de produção ainda não está no
compose de deploy; o job local e os testes (`pnpm test:backup`) já são
o contrato. Ao levar para o host, o endpoint S3 deixa de ser o MinIO e
o par age é gerado fora do container.

Observabilidade local (profile à parte): logs JSON na API, GlitchTip
compatível com o SDK do Sentry, Prometheus em `/metrics`, Grafana.
Redis nesse compose existe só para o GlitchTip.

## 10. Checklist para um projeto novo

Troque `<projeto>`, o domínio e o escopo dos pacotes. A forma permanece.

1. Monorepo pnpm + Turborepo. `apps/web`, `apps/api`, `packages/database`
   (Prisma fora da API), `packages/types`, `packages/config`. Versão só
   no `package.json` da raiz. Grupo `fixed` no Changesets.
2. Compose da raiz só para desenvolvimento. Compose de deploy em
   `infra/deploy/`, com override que zera portas e adiciona o Caddy.
3. Dockerfiles com contexto na raiz. Web em standalone, API interna via
   `/backend`, cookie host-only.
4. Husky: `commit-msg` e `pre-push` no mesmo intervalo do
   `commitlint.yml`. CI em todo PR contra `main`: `lint`, `build`,
   `test`. Changeset obrigatório, com escape `no-changeset`.
5. GitHub App para o Release PR. `tag-release.yml` só quando a versão
   da raiz muda. Imagens `api`, `web`, `migrate` no GHCR, tag `vX.Y.Z`.
6. VPS: usuário `deploy`, clone em `/opt/<projeto>`, ufw 22/80/443,
   login GHCR `read:packages`. Duas chaves SSH com forced command.
   Environments `production` e `preview`. `DEPLOY_ENABLED` desligado até
   o primeiro ensaio manual.
7. DNS explícito para os hosts fixos e wildcard de um nível para
   `pr-<N>` e `api-pr-<N>`. TLS on demand com marcador em disco.
8. `deploy-prod`: pull, Postgres, `REVOKE CONNECT`, migrate no host,
   `up --wait`, gravar `.env.image`, Caddy, smoke. Rollback pela tag
   anterior, sem desfazer migration.
9. Preview por label, teto de 2, banco e usuário próprios, teardown ao
   fechar ou ao tirar a label. Pular fork e o branch do Changesets.
10. Backup cifrado fora do volume do banco, com restore test. Métricas
    e DSN de erro na API desde o início, mesmo que o painel fique só
    no laptop no começo.

## 11. Decisões que o modelo já fechou

- Promover a imagem que o CI publicou. Não rebuildar no servidor.
- Migration no host, nunca no runner.
- Chave de preview sem poder de produção nem de `git checkout`.
- Preview opt-in (label), com teto, no mesmo Postgres e isolado por
  `REVOKE CONNECT`.
- Release acumulado num PR, deploy só no merge dele.
- Expand/contract como regra de schema, porque o rollback de imagem não
  desfaz SQL.
- Compose local e compose de deploy separados.

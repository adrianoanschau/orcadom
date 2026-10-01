# Deploy no VPS e previews de PR

Produção e previews rodam no mesmo VPS. O GitHub Actions só builda
imagens e entra por SSH; o Postgres nunca fica exposto ao runner.
Preparação da máquina: [`infra/deploy/SERVIDOR.md`](../infra/deploy/SERVIDOR.md).

## 1. Onde fica o quê

VPS Hostinger KVM 1 (1 vCPU, 4 GB RAM, 2 GB swap), Ubuntu 24.04, IP
`179.236.230.240`, usuário `deploy`, clone em `/opt/orcadom`.

Imagens buildadas só no GitHub Actions e publicadas no GHCR
(`ghcr.io/adrianoanschau/orcadom/{api,web,migrate}`). O VPS só faz pull.

| Host | O que serve |
|---|---|
| `orcadom.aanschau.tech` | web de produção |
| `api.orcadom.aanschau.tech` | API de produção (Swagger em `/api/docs`) |
| `n8n.aanschau.tech` | n8n de produção |
| `pr-<N>.orcadom.aanschau.tech` | web do preview do PR N |
| `api-pr-<N>.orcadom.aanschau.tech` | API do preview do PR N |

O DNS de produção (`orcadom` e `api.orcadom`) é explícito. O wildcard
`*.orcadom.aanschau.tech` cobre os previews (um nível só:
`pr-12` e `api-pr-12`). `n8n.aanschau.tech` também é explícito — o
wildcard não alcança esse host.

## 2. Arquitetura

Só o Caddy publica porta (80 e 443). O resto fala por rede Docker.

```
Internet
   │  :80 / :443
   ▼
Caddy                         rede orcadom_edge
   ├── web   (produção)
   ├── api   (produção)
   ├── n8n
   ├── web   do preview (orcadom-pr-<N>-web)
   └── api   do preview (orcadom-pr-<N>-api)

rede orcadom_backend (nenhuma porta publicada)
   postgres · api · n8n · migrate
   api e migrate de cada preview
```

O navegador chama `/backend/*` na própria origem do web. O Next
encaminha para a API interna (`API_URL=http://api:8080` em produção;
no preview, o container da API daquele PR). Por isso não há CORS nem
cookie cross-site nesse fluxo: `NEXT_PUBLIC_API_URL=/backend` é fixo no
build, e a mesma imagem web serve qualquer host.

Cookies de sessão continuam host-only (sem `Domain`). Um preview em
`pr-<N>.orcadom.aanschau.tech` não recebe o cookie de produção.

## 3. Push na main → produção

Workflow [`deploy-production.yml`](../.github/workflows/deploy-production.yml).

1. Build e push de `api`, `web` e `migrate`, tags `sha-<12 do commit>`
   (imutável) e `main` (móvel).
2. Se `DEPLOY_ENABLED` do environment `production` não for `true`, o
   job avisa e para. As imagens já foram publicadas.
3. SSH como `deploy`: `update-repo <sha40>` e depois
   `deploy-prod <tag>`.

No VPS, `deploy-prod.sh` baixa as imagens, sobe o Postgres, revoga
`CONNECT` nos bancos de produção para `PUBLIC`, roda
`prisma migrate deploy` no container `migrate` e só então faz
`compose up`. A chave SSH de produção está presa ao forced command
`ssh-gate.sh prod` — o workflow não tem shell livre.

`tag-release.yml` continua publicando as mesmas três imagens com
`vX.Y.Z` quando o commit é `chore: release`. Isso não dispara deploy.
Quem sobe a versão em produção é o push na `main` (tag `sha-…`), ou o
rollback manual.

## 4. PR → preview → teardown

Workflow [`preview.yml`](../.github/workflows/preview.yml), nos eventos
`opened`, `synchronize`, `reopened` e `closed` contra `main`.

Não usa `pull_request_target`. Pula PR de fork e o Release PR do
changesets (`changeset-release/main`). PR em rascunho ganha preview;
para passar a ignorar, o comentário no topo do workflow mostra o `if`.

1. `deploy-preview --check <N>` — se já existem 2 outros previews, o
   script sai com código 75.
2. Nesse caso o workflow comenta no PR e falha. O comentário é fixo
   (marcador `<!-- orcadom-preview -->`, atualizado em vez de duplicado).
3. Com vaga: build das três imagens, tags `pr-<N>-<7 do SHA>` (imutável)
   e `pr-<N>` (móvel).
4. `deploy-preview <N> <tag>`. Se dois PRs passarem no check ao mesmo
   tempo, o segundo ainda pode sair 75; o comentário de limite é o mesmo.
5. Comentário com a URL do web, o Swagger da API, a tag, o SHA curto e
   as contas do seed (`owner@`, `member@` e `solo@staging.orcadom.local`,
   senha `staging-orcadom`).
6. Ao fechar o PR, `destroy-preview <N>` apaga containers, banco e
   usuário. O comentário vira "Preview removido".

A chave do environment `preview` só aceita `deploy-preview`,
`destroy-preview` e `status`. Não atualiza o clone nem faz deploy de
produção.

Máximo de 2 previews ao mesmo tempo (`PREVIEW_MAX` no `.env` do VPS).
Preview é só web + API: sem n8n.

O banco do preview é `orcadom_pr_<N>`, com usuário de mesmo nome, no
mesmo Postgres de produção. Esse usuário não é superuser e não recebe
`CONNECT` em `orcadom_db` nem em `postgres` (`REVOKE CONNECT … FROM PUBLIC`
no deploy de produção e de novo na criação do preview). O seed sintético
(`seed-staging`) roda só quando o banco é criado.

O TLS dos previews é on-demand. O Caddy só pede certificado se o
endpoint `ask` (`127.0.0.1:5555/ask`, dentro do container) responder
200, e ele responde 200 só quando existe o arquivo-marcador
`previews/active/<host>`. Os scripts criam e apagam esses arquivos. Não
precisa de reload do Caddy.

## 5. GitHub Environments

O `GITHUB_TOKEN` dos jobs de build precisa de `packages: write`
(Settings → Actions → Workflow permissions em Read and write). Se os
pacotes `api`/`web`/`migrate` já existirem no GHCR, em Package settings
→ Manage Actions access o repositório precisa de Write.

`DEPLOY_ENABLED` é variável do environment, lida num step. Não dá para
usar em `jobs.<id>.if`.

| Environment | Regra de branch | Variable | Secrets |
|---|---|---|---|
| `production` | só `main` | `DEPLOY_ENABLED` | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (chave prod), `DEPLOY_KNOWN_HOSTS` |
| `preview` | sem restrição (o PR roda em `refs/pull/N/merge`) | `DEPLOY_ENABLED` | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (chave preview), `DEPLOY_KNOWN_HOSTS` |

Não há `DATABASE_URL` no GitHub. A migration roda no VPS, com o
`DATABASE_URL` do `.env` de `/opt/orcadom`. Não há `GHCR_PULL_TOKEN` no
workflow: o VPS já está logado no GHCR.

Enquanto `DEPLOY_ENABLED` não for `true`, o workflow publica imagem (no
caso da `main`) ou só avisa e sai verde (preview e rollback).

## 6. Rollback

[`deploy.yml`](../.github/workflows/deploy.yml) é manual
(`workflow_dispatch`), input `tag` (`v0.16.0` ou `sha-…`), environment
`production`. Um único SSH: `deploy-prod <tag>`.

A migration roda de novo no VPS e não volta atrás. Rollback de schema
continua sendo expand/contract, não "desfazer o SQL".

Tags `≤ v0.15.1` não têm imagem `migrate` e não podem ser usadas nesse
rollback.

O clone no VPS não muda nesse workflow: a tag escolhida é só a das
imagens. O compose é o que estiver em `/opt/orcadom` (atualizado pelo
`update-repo` do deploy de produção).

Não existe host de staging. Se um dia existir, o modelo é o mesmo com
outro environment — não uma matriz neste workflow.

## 7. Ensaio de preview

Parágrafo temporário para validar o workflow de preview. Feche o PR sem
mergear: ao fechar, o preview é apagado.

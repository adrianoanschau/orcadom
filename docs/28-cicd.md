# CI/CD

> Detalhamento do item 9 do [roadmap para a 1.0](./15-roadmap-v1.md). Item
> de infraestrutura — não incrementa `MINOR`. Estende diretamente
> [`17-implementacao-versionamento.md`](./17-implementacao-versionamento.md),
> que já implementou a automação de changeset/tag/release — este item
> completa a pipeline com lint, teste, build e deploy em volta dela.

## 1. Objetivo

Pipeline automatizado de build, teste e deploy para os dois apps do
monorepo, com migration de banco executada de forma controlada, não
manual.

## 2. O que já existe (de `17`) e o que falta

| Já implementado (`17`) | Falta (este item) |
|---|---|
| `changeset-check.yml` — gate de changeset em PR | `ci.yml` — gate de lint/build/teste em PR |
| `release.yml` — Release PR automático | Build e push de imagem Docker no merge do Release PR |
| `tag-release.yml` — tag + GitHub Release | Deploy automatizado para staging + promoção para produção |
| — | Execução controlada de migration do Prisma por ambiente |

## 3. Escopo técnico

### 3.1 — `ci.yml` (gate em todo PR)

```yaml
name: CI
on:
  pull_request:
    branches: [main]
jobs:
  build-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm turbo run lint build test
```

Aproveitando o cache do Turborepo já configurado desde
`01-arquitetura-monorepo.md` — builds incrementais, não do zero a cada PR.

### 3.2 — Build e push de imagem (extensão de `tag-release.yml`)

No ponto de extensão já deixado explícito em `17` (seção 2.6): após a
criação da tag, builda as imagens de `apps/api` e `apps/web`, tagueadas
com a versão, e publica no GitHub Container Registry (`ghcr.io` — natural
por já estar no GitHub, sem outra conta de serviço).

### 3.3 — Deploy e migration controlada

- **Staging:** deploy automático a cada tag criada (depende do ambiente
  de Staging, item 10, existir).
- **Produção:** promoção da **mesma imagem** já validada em staging
  (nunca rebuild) — decisão já registrada em `16-versionamento.md`, seção
  5.2 — via aprovação manual (GitHub Environments com regra de proteção).
- **Migration do Prisma** como etapa própria do job de deploy
  (`prisma migrate deploy`), usando o `DATABASE_URL` do ambiente via
  GitHub Environments (segredo diferente por ambiente, nunca o mesmo
  valor entre staging e produção).

## 4. Fases de Execução

1. `ci.yml` como gate obrigatório de PR.
2. Build e push de imagem Docker, integrado ao `tag-release.yml` já
   existente.
3. Deploy automático em staging.
4. Promoção manual para produção (mesma imagem).
5. Migration controlada como etapa própria do pipeline, com segredo por
   ambiente.

## 5. Riscos e pontos de atenção

- **Migration automatizada exige disciplina de escrita de migration que
  antes podia ser compensada por cuidado manual** — uma migration
  destrutiva (ex: renomear coluna sem etapa de transição) que antes seria
  pega por revisão cuidadosa manual agora roda sem essa rede de segurança
  humana no meio. Migrations de mudança estrutural devem seguir padrão
  *expand/contract* (adicionar novo, migrar dado, só depois remover o
  antigo) — já usado implicitamente na migração de `13-multiusuario.md` —
  formalizado agora como prática obrigatória da pipeline, não só uma boa
  ideia pontual.
- **Este item fica funcionalmente incompleto sem o Ambiente de Staging
  (item 10)** — o deploy automatizado não tem para onde ir sem ele;
  ambos foram desenhados sabendo dessa dependência (`15-roadmap-v1.md`).
- **Segredos por ambiente mal configurados são o erro mais comum de
  pipeline de deploy** — confirmar, antes de considerar esta fase
  concluída, que staging e produção realmente usam credenciais e
  `DATABASE_URL` diferentes, não a mesma variável reaproveitada por
  descuido.

## 6. Implementação

O desenho das seções 3.3 e 4 (migration no runner, `DATABASE_URL` no
GitHub, deploy a cada Release para um host de staging) foi substituído
pelo que está abaixo. O host é um VPS único; o passo a passo operacional
está em [`32-deploy-vps-previews.md`](./32-deploy-vps-previews.md) e em
[`infra/deploy/SERVIDOR.md`](../infra/deploy/SERVIDOR.md).

Workflows em `.github/workflows/`. Imagens em
`ghcr.io/<owner>/<repo>/{api,web,migrate}`. Compose de deploy em
[`infra/deploy/docker-compose.yml`](../infra/deploy/docker-compose.yml)
mais o override [`docker-compose.prod.yml`](../infra/deploy/docker-compose.prod.yml)
— **não** entra em `pnpm docker:up`; o compose da raiz continua só local
([`05-infraestrutura-docker.md`](./05-infraestrutura-docker.md)).

Nenhum workflow roda `prisma migrate` no runner, nem contra um banco
real. A migration roda no container `migrate`, dentro do VPS, antes do
`compose up`. Não há `DATABASE_URL` nos secrets do GitHub.

Os jobs de deploy saem no primeiro passo se `vars.DEPLOY_ENABLED` do
environment não for `true`. Build de imagem, tag e Release continuam
verdes.

### 6.1 — Workflows

| Workflow | Quando | O que faz |
|---|---|---|
| `ci.yml` | todo PR contra `main` | generate Prisma, `turbo run lint build test` (cache `.turbo`), `pnpm test:backup`; job paralelo `e2e-smoke` (Postgres efêmero + Playwright) |
| `e2e-nightly.yml` | cron diário + `workflow_dispatch` | suíte E2E completa contra Postgres efêmero |
| `changeset-check.yml` | todo PR contra `main`, exceto o Release PR (`chore: release`) e PRs com label `no-changeset` | exige changeset |
| `commitlint.yml` | todo PR contra `main` | Conventional Commits |
| `release.yml` | push em `main` | abre/atualiza o Release PR |
| `tag-release.yml` | push em `main` cujo commit começa com `chore: release` | tag `vX.Y.Z`, build/push GHCR de api, web e migrate, GitHub Release com as URLs |
| `deploy-production.yml` | push em `main` ou `workflow_dispatch` | build/push `sha-<12>` e `main`; SSH `update-repo` + `deploy-prod` se `DEPLOY_ENABLED=true` |
| `preview.yml` | PR contra `main` com a label `preview` (abre, sincroniza, reabre, label); teardown ao fechar ou ao tirar a label | preview web+api em `pr-<N>.orcadom.aanschau.tech`. Pula fork e o Release PR |
| `deploy.yml` | só `workflow_dispatch` (input `tag`) | rollback: SSH `deploy-prod <tag>` no environment `production` |

Imagens de release: `ghcr.io/<owner>/<repo>/{api,web,migrate}:vX.Y.Z`
(também sem o prefixo `v`). O deploy do dia a dia usa `sha-<12>`, não a
tag de release. Tags `≤ v0.15.1` não têm imagem `migrate` e não servem
no rollback.

Não existe host de staging. Se um dia existir, segue o mesmo modelo
(environment próprio, migration no host, chave SSH com forced command)
— não uma matriz neste repositório.

### 6.2 — GitHub Environments (checklist)

Criar em Settings → Environments. Segredos **por environment**. A chave
de `preview` é outra: no VPS ela só aceita comandos de preview.

| Environment | Regra de branch | Variable | Secrets |
|---|---|---|---|
| `production` | só `main` | `DEPLOY_ENABLED` (`true` liga o deploy; outro valor = aviso e skip) | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (chave prod), `DEPLOY_KNOWN_HOSTS` |
| `preview` | sem restrição (o job roda em `refs/pull/N/merge`) | `DEPLOY_ENABLED` | `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` (chave preview), `DEPLOY_KNOWN_HOSTS` |

Ordem ao ligar produção:

1. Preparar o VPS ([`SERVIDOR.md`](../infra/deploy/SERVIDOR.md)) com
   `DEPLOY_ENABLED` ainda diferente de `true`, para o primeiro push só
   publicar imagem.
2. Criar o environment `production` (branch só `main`) e `preview`.
3. Colar host, usuário, chave e `known_hosts`.
4. Só então `DEPLOY_ENABLED=true` em `production`. O de `preview` pode
   ir junto, quando o forced command da chave de preview já estiver no
   `authorized_keys`.

Permissões do repositório: Actions → General → Workflow permissions em
Read and write (já necessário para o Release PR e para publicar no
GHCR). Nos pacotes que já existirem, Package settings → Manage Actions
access → Write para este repositório.

Branch protection em `main`: exigir os checks `build-test` e `e2e-smoke`
(este `ci.yml`) além de `changeset-check` e `commitlint`.

### 6.3 — Imagens e compose de deploy

Dockerfiles em `apps/api/Dockerfile`, `apps/web/Dockerfile` e
`packages/database/Dockerfile` (imagem `migrate`), contexto na raiz do
monorepo (`turbo prune`). O web usa `output: 'standalone'` e o proxy
`/backend` (`API_URL` é runtime). CORS da API lê `WEB_ORIGIN`
(default `http://localhost:3000`; várias origens separadas por vírgula).

Build local para validar:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/local/orcadom/api:dev .
docker build -f apps/web/Dockerfile -t ghcr.io/local/orcadom/web:dev .
docker build -f packages/database/Dockerfile -t migrate:dev .
IMAGE_TAG=x docker compose \
  --env-file infra/deploy/.env.production.example \
  -f infra/deploy/docker-compose.yml \
  -f infra/deploy/docker-compose.prod.yml \
  --profile deps --profile tools config
```

No VPS o clone vive em `/opt/orcadom`. O `.env` desse clone alimenta o
compose. A tag em uso fica em `.env.image` (a anterior, em
`.env.image.prev`) — os dois estão no `.gitignore`. Quem grava é o
`deploy-prod.sh`, não o runner.

### 6.4 — Expand/contract

Migration destrutiva (renomear/remover coluna numa única etapa) agora
roda sozinha no deploy, dentro do VPS. Mudança estrutural segue
expand/contract: adicionar o novo, migrar o dado, só depois remover o
antigo. Já foi o padrão de `13-multiusuario.md`; a pipeline torna isso
obrigatório. Rollback de imagem não desfaz migration.

### 6.5 — Staging (item 10) e o que o VPS já cobre

Previews de PR (banco isolado, seed sintético, no máximo 2) são a
validação antes do merge. Não substituem um ambiente de staging com
domínio e caixa de email próprios — isso continua em
[`29-staging.md`](./29-staging.md).

Se esse host for criado, o deploy dele repete o modelo de produção com
outro GitHub Environment. O `deploy.yml` atual não tem matriz staging.

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

Workflows em `.github/workflows/`. Imagens em `ghcr.io/<owner>/<repo>/{api,web}`.
Compose de deploy em [`infra/deploy/docker-compose.yml`](../infra/deploy/docker-compose.yml)
— **não** entra em `pnpm docker:up`; o compose da raiz continua só local
([`05-infraestrutura-docker.md`](./05-infraestrutura-docker.md)).

O host de staging/produção (item 10) ainda não existe. Os jobs de deploy
rodam a cada GitHub Release, mas saem no primeiro passo se
`vars.DEPLOY_ENABLED` do environment não for `true`. Tag, imagens e
Release continuam verdes.

### 6.1 — Workflows

| Workflow | Quando | O que faz |
|---|---|---|
| `ci.yml` | todo PR contra `main` | generate Prisma, `turbo run lint build test` (cache `.turbo`), `pnpm test:backup` |
| `changeset-check.yml` | todo PR contra `main`, exceto o Release PR (`chore: release`) e PRs com label `no-changeset` | exige changeset |
| `commitlint.yml` | todo PR contra `main` | Conventional Commits |
| `release.yml` | push em `main` | abre/atualiza o Release PR |
| `tag-release.yml` | push em `main` cujo commit começa com `chore: release` | tag `vX.Y.Z`, build/push GHCR, GitHub Release com URLs das imagens |
| `deploy.yml` | `release: published` ou `workflow_dispatch` | `prisma migrate deploy` + SSH `compose pull/up` da **mesma** tag, por environment |

Imagens: `ghcr.io/<owner>/<repo>/api:vX.Y.Z` e `.../web:vX.Y.Z` (também
sem o prefixo `v`). Produção puxa essa tag — nunca rebuild.

### 6.2 — GitHub Environments (checklist)

Criar em Settings → Environments. Segredos **por environment**, nunca
no repositório compartilhado entre staging e produção.

| Nome | Tipo | Onde | Função |
|---|---|---|---|
| `DEPLOY_ENABLED` | variable | environment | `true` liga o job; qualquer outro valor = skip sem falhar |
| `DEPLOY_PATH` | variable | environment | diretório do clone no host (padrão `/opt/orcadom`) |
| `DATABASE_URL` | secret | environment | Postgres daquele ambiente; tem que ser o mesmo do `.env` do host |
| `DEPLOY_HOST` | secret | environment | hostname/IP para SSH |
| `DEPLOY_USER` | secret | environment | usuário SSH |
| `DEPLOY_SSH_KEY` | secret | environment | chave privada |
| `GHCR_PULL_TOKEN` | secret | environment | PAT (ou token) com `read:packages` para o host puxar imagens privadas |

Ordem ao ligar produção (evita promover sem aprovação):

1. Criar o environment `production` e preencher os segredos (valores
   **diferentes** dos de staging — conferir `DATABASE_URL` lado a lado).
2. Em production, marcar **Required reviewers**.
3. Só então `DEPLOY_ENABLED=true`.

Staging não tem reviewer: a cada tag, migrate + pull acontecem sozinhos
quando o host (item 10) existir.

Permissões do repositório: Actions → General → Workflow permissions em
Read and write (já necessário para o Release PR). Packages: o
`GITHUB_TOKEN` do `tag-release.yml` precisa conseguir publicar em GHCR
(`packages: write` no job).

Branch protection em `main`: exigir o check `build-test` (este `ci.yml`)
além de `changeset-check` e `commitlint`.

### 6.3 — Imagens e compose de deploy

Dockerfiles em `apps/api/Dockerfile` e `apps/web/Dockerfile`, contexto na
raiz do monorepo (`turbo prune` + build). O web usa `output: 'standalone'`
e o proxy `/backend` (`API_URL` é runtime, aponta para `http://api:8080`
no compose). CORS da API lê `WEB_ORIGIN` (default `http://localhost:3000`).

Build local para validar:

```bash
docker build -f apps/api/Dockerfile -t ghcr.io/local/orcadom/api:dev .
docker build -f apps/web/Dockerfile -t ghcr.io/local/orcadom/web:dev .
GHCR_IMAGE_PREFIX=ghcr.io/local/orcadom IMAGE_TAG=dev \
  docker compose --env-file .env -f infra/deploy/docker-compose.yml up -d
```

No host de staging/produção o clone vive em `DEPLOY_PATH`. O `.env` da
raiz desse clone alimenta o compose (`--env-file .env`). O pipeline só
injeta `IMAGE_TAG` e `GHCR_IMAGE_PREFIX`.

Migration no runner do GitHub, **antes** do `compose up`:

```bash
pnpm db:migrate:deploy   # prisma migrate deploy em @orcadom/database
```

`DATABASE_URL` vem do secret do environment, não do `.env` do runner.

### 6.4 — Expand/contract

Migration destrutiva (renomear/remover coluna numa única etapa) agora
roda sozinha no deploy. Mudança estrutural segue expand/contract:
adicionar o novo, migrar o dado, só depois remover o antigo. Já foi o
padrão de `13-multiusuario.md`; a pipeline torna isso obrigatório.

### 6.5 — O que fica para o item 10 (host)

Artefatos no repositório (compose com profile `deps`, seed sintético,
template `.env`, runbook): ver [`29-staging.md`](./29-staging.md) §6.

Ainda operacional, quando a cloud for escolhida:

- Provisionar o host, DNS/TLS e caixa de email de teste.
- Clonar o repo em `DEPLOY_PATH`, `.env` isolado.
- Ligar `DEPLOY_ENABLED=true` em staging (e, depois da validação,
  production com reviewers).

A interface que o item 10 consome já está neste repositório: `deploy.yml`,
`infra/deploy/docker-compose.yml` e a tabela de secrets acima.

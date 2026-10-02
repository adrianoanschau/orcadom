# Orçadom

[![Release](https://img.shields.io/github/v/release/adrianoanschau/orcadom?sort=semver)](https://github.com/adrianoanschau/orcadom/releases/latest)

Sistema de orçamento doméstico: contas, lançamentos e o saldo do mês.

## Stack

Monorepo com pnpm workspaces e Turborepo.

| Caminho | O que é |
| --- | --- |
| `apps/web` | Next.js (`@orcadom/web`) |
| `apps/api` | API NestJS (`@orcadom/api`) |
| `packages/database` | Prisma e migrations (`@orcadom/database`) |
| `packages/types` | Tipos e schemas Zod compartilhados (`@orcadom/types`) |
| `packages/config` | ESLint, Prettier e tsconfig base (`@orcadom/config`) |

Postgres 16 sobe pelo `docker-compose.yml` da raiz. O n8n, no mesmo compose, importa extratos recebidos por e-mail.

## Rodando localmente

- Node `>=20` (`engines` do `package.json`)
- pnpm `9.12.0` (`packageManager`)
- Docker, para o Postgres

```bash
pnpm install
cp .env.example .env
pnpm db:up
pnpm db:migrate
pnpm dev
```

`pnpm db:up` sobe só o Postgres. `pnpm docker:up` sobe Postgres e n8n. As variáveis locais estão em [`.env.example`](./.env.example). Os exemplos de deploy ficam em [`infra/deploy/.env.production.example`](./infra/deploy/.env.production.example) e [`infra/deploy/.env.staging.example`](./infra/deploy/.env.staging.example).

`pnpm dev` sobe o web em `http://localhost:3000` e a API na porta `PORT` do `.env` (8080 no exemplo).

## Testes e qualidade

```bash
pnpm lint
pnpm test
pnpm build
```

A checagem de tipos entra no `pnpm build`. O job `build-test` do [`.github/workflows/ci.yml`](./.github/workflows/ci.yml) roda `pnpm turbo run lint build test` e, em seguida, `pnpm test:backup`.

## Fluxo de trabalho

A `main` é protegida e só recebe merge de pull request. Mudança de produto leva um changeset:

```bash
pnpm changeset
```

A label `preview` no PR publica o preview em `https://pr-<N>.orcadom.aanschau.tech` (a API em `https://api-pr-<N>.orcadom.aanschau.tech`).

## Releases e deploy

O merge na `main` atualiza a pull request `chore: release` (Changesets, workflow `release.yml`). O merge dessa PR cria a tag `vX.Y.Z`, publica as imagens `api`, `web` e `migrate` no GHCR, abre a GitHub Release e faz o deploy de produção em [orcadom.aanschau.tech](https://orcadom.aanschau.tech).

Redeploy de uma tag já publicada: `workflow_dispatch` do [`deploy-production.yml`](./.github/workflows/deploy-production.yml) (Actions → **Deploy produção**), a partir da branch `main`, com o input `version` (ex.: `v0.18.0`).

## Novidades

O histórico de versão é gerado pelo Changesets.

- [Releases](https://github.com/adrianoanschau/orcadom/releases)
- [`apps/web/CHANGELOG.md`](./apps/web/CHANGELOG.md)

## Documentação

A pasta [`/docs`](./docs) concentra o desenho do produto. Os documentos de entrada:

- [Orcadom — Visão Geral do Projeto](./docs/00-visao-geral.md)
- [Arquitetura do Monorepo](./docs/01-arquitetura-monorepo.md)
- [Modelagem de Dados](./docs/02-modelagem-dados.md)
- [Decisões Arquiteturais](./docs/03-decisoes-arquiteturais.md)
- [Infraestrutura Local (Docker)](./docs/05-infraestrutura-docker.md)
- [Versionamento — SemVer e Rotina de Releases](./docs/16-versionamento.md)
- [CI/CD](./docs/28-cicd.md)
- [Deploy no VPS e previews de PR](./docs/32-deploy-vps-previews.md)

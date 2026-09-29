# Ambiente de Staging Formal

> Detalhamento do item 10 do [roadmap para a 1.0](./15-roadmap-v1.md). Item
> de infraestrutura — não incrementa `MINOR`. Depende de CI/CD (item 9)
> para o deploy automatizado ter função real.

## 1. Objetivo

Ambiente separado de produção, com dados representativos, para validar
mudanças antes do deploy real — a recomendação já feita em
`13-multiusuario.md` (rodar o backfill de household em staging antes de
produção) só vale na prática quando esse ambiente existe de fato.

## 2. Decisão central: dados sintéticos, não cópia anonimizada de produção

Duas abordagens de dado de teste foram consideradas: copiar produção com
mascaramento de PII, ou gerar dados sintéticos (fixtures) do zero. Para a
escala do Orcadom (uso pessoal/familiar, não um sistema com padrões de
dado real complexos demais para simular), **dados sintéticos** são
adotados como padrão — mais simples, sem risco de vazamento de dado real
mesmo mascarado, e suficiente para validar os fluxos críticos. Só se os
dados sintéticos pararem de pegar bugs reais é que vale escalar para
cópia anonimizada de produção.

## 3. Escopo técnico

- Infraestrutura espelhando produção: os mesmos serviços do
  `docker-compose.yml` (Postgres, n8n, api, web), em escala menor.
- **Credenciais e domínio próprios, nunca compartilhados com
  produção** — inclusive a caixa de email de importação (`08`): staging
  precisa de uma caixa de teste separada de `importacoes@orcadom.app`, não
  reaproveitada, para não misturar email de teste com o fluxo real de
  produção.
- Script de seed sintético: households de teste com contas, categorias,
  transações, orçamentos, parcelamentos e recorrências variados —
  cobrindo os cenários que os testes E2E (item 11) e a validação manual
  pré-deploy precisam.

## 4. Fases de Execução

1. **Provisionamento da infraestrutura**, parametrizada por ambiente (o
   mesmo `docker-compose.yml`/definição de infra, não uma cópia manual
   duplicada — evita drift de configuração entre staging e produção).
2. **Credenciais e domínio isolados**, incluindo a caixa de email de
   teste para o n8n.
3. **Script de seed sintético**.
4. **Integração com o deploy automatizado** (item 9) — a cada tag
   criada, o deploy em staging já acontece sozinho. A interface já
   existe: `deploy.yml`, `infra/deploy/docker-compose.yml` e os secrets
   por GitHub Environment. Este item provisiona o host, o `.env`
   isolado e liga `DEPLOY_ENABLED=true` em staging.

## 5. Riscos e pontos de atenção

- **Staging tende a divergir de produção com o tempo se mantido
  manualmente** — tratar toda a infraestrutura como código (mesma
  definição parametrizada por ambiente) é o que evita esse drift, não
  disciplina de manter os dois em sincronia manualmente.
- **Reaproveitar a caixa de email de produção em staging é um erro fácil
  de cometer e com efeito colateral real** — um teste em staging poderia
  processar (ou marcar como lido) um email real de um usuário de
  produção. Vale checar isso explicitamente antes de considerar o
  ambiente pronto para uso.
- **Custo de manter um ambiente a mais rodando 24/7** — se isso pesar,
  considerar escalar staging sob demanda (subir só quando necessário)
  em vez de deixá-lo sempre ativo, sem abrir mão do isolamento de dados e
  credenciais.

## 6. Implementação (artefatos no repositório)

A definição de deploy e o seed sintético estão no repo. O **host cloud**,
DNS/TLS, caixa de email real e `DEPLOY_ENABLED=true` ficam como passo
operacional quando a hospedagem for escolhida — o pipeline
([`28-cicd.md`](./28-cicd.md)) já no-op até essa variável.

### 6.1 — Compose parametrizado

[`infra/deploy/docker-compose.yml`](../infra/deploy/docker-compose.yml)
sempre sobe `api` + `web`. Postgres e n8n entram pelo profile `deps`
(mesma definição que produção, sem cópia duplicada):

```bash
# Produção / staging com Postgres gerenciado (Neon, RDS, …)
docker compose --env-file .env -f infra/deploy/docker-compose.yml up -d

# Staging self-contained (VPS pequeno)
COMPOSE_PROFILES=deps docker compose --env-file .env \
  -f infra/deploy/docker-compose.yml up -d
```

Com `deps`, `DATABASE_URL` deve usar o host `postgres` na rede do
compose. Sem o profile, `depends_on` do Postgres é `required: false`.

O compose da raiz continua só para desenvolvimento local
(`pnpm docker:up`).

### 6.2 — Template de `.env` de staging

[`infra/deploy/.env.staging.example`](../infra/deploy/.env.staging.example)
— copiar para `DEPLOY_PATH/.env` no host. Destaca:

- `SENTRY_ENVIRONMENT=staging`
- `IMPORT_EMAIL_MAILBOX` com placeholder de caixa de **teste** (nunca
  `importacoes@orcadom.app`)
- JWT / `AUTOMATION_API_KEY` / `DATABASE_URL` próprios
- Lista dos secrets do GitHub Environment `staging`

### 6.3 — Seed sintético

```bash
pnpm db:migrate:deploy
pnpm db:seed:staging
# wipe total dos users/households de staging:
STAGING_SEED_RESET=true pnpm db:seed:staging
```

Script: [`packages/database/prisma/seed-staging.ts`](../packages/database/prisma/seed-staging.ts).
O seed mínimo de onboarding local (`pnpm db:seed`) permanece separado.

| Email | Senha | Household |
|---|---|---|
| `solo@staging.orcadom.local` | `staging-orcadom` | Staging Solo |
| `owner@staging.orcadom.local` | `staging-orcadom` | Staging Família (OWNER) |
| `member@staging.orcadom.local` | `staging-orcadom` | Staging Família (MEMBER) |

Cobertura: contas (corrente, cartão, poupança), categorias, lançamentos
(~3 meses + transferências), orçamentos, parcelamento com parcelas
POSTED/SCHEDULED, recorrências. Re-executar limpa e recria os dados
financeiros desses households.

### 6.4 — Checklist para ligar o host (quando a cloud existir)

1. Provisionar o host (VPS ou PaaS) com Docker e SSH.
2. Clonar o repo em `DEPLOY_PATH` (padrão `/opt/orcadom`).
3. Criar `.env` a partir de `.env.staging.example` — valores **diferentes**
   de produção.
4. Conferir anti-erro: `IMPORT_EMAIL_MAILBOX` ≠ produção;
   `DATABASE_URL` ≠ produção.
5. Subir a stack (`deps` ou managed) e aplicar migrate + seed.
6. Preencher o GitHub Environment `staging` (tabela em
   [`28-cicd.md`](./28-cicd.md) §6.2).
7. Só então `DEPLOY_ENABLED=true` — releases passam a deployar sozinhas
   em staging.

Produção continua com Required reviewers + `DEPLOY_ENABLED` só depois
da validação em staging.

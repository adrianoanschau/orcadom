# Observabilidade

> Detalhamento do item 7 do [roadmap para a 1.0](./15-roadmap-v1.md). Item
> de infraestrutura — não incrementa `MINOR` (`16-versionamento.md`,
> seção 4.1).

## 1. Objetivo

Logs estruturados, métricas e rastreamento de erro em produção — visão
sobre o que a aplicação está fazendo, especialmente as rotinas que rodam
sozinhas (cron de parcelamento, cron de recorrência, automação de email),
sem depender de reclamação do usuário para descobrir um problema.

## 2. Decisão central: reaproveitar o contexto de ator já construído

A feature de Auditoria (`14`) já introduziu `AsyncLocalStorage` para
propagar `{ userId, householdId, source }` por requisição. Observabilidade
estende **o mesmo mecanismo**, em vez de criar um segundo sistema de
contexto: adiciona um `requestId` a esse contexto, usado para correlacionar
todas as linhas de log de uma mesma requisição (ou execução de job).

```ts
// Extensão do contexto já existente em 14-auditoria.md
actorContext.run(
  {
    userId: req.user?.id ?? null,
    householdId: req.household?.id ?? null,
    source: '...',
    requestId: randomUUID(), // novo campo
  },
  () => next.handle().subscribe(subscriber),
);
```

## 3. Escopo técnico

- **Logging estruturado (JSON):** `nestjs-pino`, substituindo
  `console.log` solto. Todo log inclui `requestId`, `userId`,
  `householdId` do contexto — sem precisar passar isso manualmente a cada
  chamada de log.
- **Sanitização de log:** reaproveita a mesma lista de exclusão de campos
  sensíveis já definida em `sanitize()` (`14-auditoria.md`) — nunca logar
  senha, token, ou corpo de requisição de autenticação sem redação.
- **Rastreamento de erro:** Sentry (ou uma alternativa self-hosted, como
  GlitchTip, se preferir não depender de serviço de terceiros) capturando
  exceções não tratadas, incluindo as dos dois jobs agendados — hoje, uma
  falha silenciosa em um cron não aparece em lugar nenhum.
- **Métricas:** endpoint `/metrics` (Prometheus), cobrindo:
  - Requisições HTTP (contagem, duração, taxa de erro por rota).
  - Duração e resultado (sucesso/falha) de cada execução dos crons de
    parcelamento e recorrência.
  - Chamadas recebidas em `/automation/*` (volume, taxa de erro).

## 4. Fases de Execução

1. **Logging estruturado + correlação**, estendendo o contexto de ator
   já existente.
2. **Rastreamento de erro**, cobrindo rotas HTTP e os dois jobs
   agendados.
3. **Métricas dos jobs agendados** — prioridade sobre métricas de negócio
   mais elaboradas, porque é a lacuna mais crítica hoje (rotinas sem
   nenhuma visibilidade).
4. **Painel de visualização** (Grafana) — incluído no profile Docker
   `observability`, junto com Prometheus. Não sobe no `docker compose up`
   diário.

## 5. Riscos e pontos de atenção

- **Log estruturado ainda pode vazar dado sensível se a lista de
  sanitização não for mantida em conjunto com a da Auditoria** — as duas
  listas (log e audit) tendem a divergir com o tempo se mantidas
  separadamente; vale compartilhar a mesma constante de campos excluídos
  entre os dois mecanismos, não duplicar.
- **Volume de log cresce rápido em produção** — definir política de
  retenção/nível de log (ex: `info` em produção, não `debug`) antes de
  considerar esta fase concluída, não depois que o custo de
  armazenamento já incomodar.

## 6. Implementação

Logs JSON (`nestjs-pino`), métricas Prometheus em `GET /metrics` e
rastreamento de erro via SDK Sentry apontando para GlitchTip self-hosted.
O contexto de ator ganhou `requestId`; crons passam por `runObservedJob`.

### 6.1 — Variáveis de ambiente

| Variável                                        | Padrão                             | Função                       |
| ----------------------------------------------- | ---------------------------------- | ---------------------------- |
| `LOG_LEVEL`                                     | `info` em produção, `debug` em dev | Nível pino                   |
| `SENTRY_DSN`                                    | vazio (SDK desligado)              | DSN do projeto no GlitchTip  |
| `SENTRY_ENVIRONMENT`                            | `development`                      | Tag de ambiente no GlitchTip |
| `GLITCHTIP_SECRET_KEY`                          | —                                  | Segredo Django do GlitchTip  |
| `GLITCHTIP_PORT`                                | `8000`                             | UI do GlitchTip              |
| `PROMETHEUS_PORT`                               | `9090`                             | Scrape UI                    |
| `GRAFANA_PORT`                                  | `3001`                             | Painel (3000 é o Next.js)    |
| `GRAFANA_ADMIN_USER` / `GRAFANA_ADMIN_PASSWORD` | `admin` / `admin`                  | Login local do Grafana       |

Política de log: **`info` em produção**, não `debug`. `/metrics` e o
corpo das rotas `/auth/login`, `/auth/register` e `/auth/refresh` não
entram no auto-log. Campos de `SENSITIVE_FIELDS` (`passwordHash`,
`token`, `tokenHash`) são a mesma lista da auditoria.

### 6.2 — Stack Docker (profile `observability`)

`pnpm docker:up` continua só com Postgres e n8n. A stack de
observabilidade é opcional no dia a dia:

```bash
pnpm obs:up    # Redis, GlitchTip, Prometheus, Grafana
pnpm obs:down  # para só esses serviços; não derruba o Postgres
```

| Serviço    | Porta | Função                                        |
| ---------- | ----- | --------------------------------------------- |
| GlitchTip  | 8000  | Erros (compatível com o DSN do Sentry)        |
| Prometheus | 9090  | Scrape de `host.docker.internal:8080/metrics` |
| Grafana    | 3001  | Dashboard provisionado `Orcadom API`          |

Primeiro uso do GlitchTip: abrir http://localhost:8000, criar
organização e projeto, copiar o DSN para `SENTRY_DSN` no `.env` e
reiniciar a API. Se o volume do Postgres **já existia** antes desta
feature, o init SQL não roda — o `obs:up` cria o database `glitchtip`
via o serviço `glitchtip-createdb`. Alternativa manual:

```bash
docker compose exec postgres psql -U orcadom -d postgres -c "CREATE DATABASE glitchtip;"
```

### 6.3 — Métricas

- `http_requests_total{method,route,status}` e
  `http_request_duration_seconds{method,route}`
- `cron_job_duration_seconds{job}` e
  `cron_job_runs_total{job,result}` (`installment_posting`,
  `recurring_generate`, `report_cleanup`, `report_resume`)
- `automation_ingest_total{status}` (status de domínio, porque a
  automação responde 200 mesmo em falha de negócio)

O Prometheus também tenta scrapar `postgres-backup:9105` (profile
`backup`). Métricas `orcadom_backup_*`, dashboard `Orcadom Backup` e
alertas de dump/restore estão em [`27-backup-postgres.md`](./27-backup-postgres.md).
Com o profile `backup` parado, esse target fica *down* — esperado.

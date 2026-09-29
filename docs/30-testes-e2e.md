# Cobertura de Testes E2E

> Detalhamento do item 11 do [roadmap para a 1.0](./15-roadmap-v1.md). Item
> de infraestrutura — não incrementa `MINOR`. Depende de CI/CD (item 9)
> para rodar automaticamente a cada mudança.

## 1. Objetivo

Suíte de testes de regressão cobrindo os fluxos críticos de todas as
features já construídas — consolidando os testes pontuais já registrados
feature a feature (ex: "testar transferência revertendo saldo nas duas
contas") em uma suíte real, executada a cada PR.

## 2. Decisão central: ambiente efêmero de CI, não o Staging compartilhado

Staging (item 10) e os testes E2E servem propósitos diferentes: staging é
para validação manual pré-deploy, com dados que persistem entre visitas;
E2E automatizado precisa de um banco **limpo a cada execução**, para não
sofrer interferência de dados residuais de uma execução anterior. Por
isso, os testes rodam contra um Postgres descartável, subido dentro do
próprio job de CI — não contra o ambiente de staging.

## 3. Ferramenta e escopo

**Playwright** — cobre tanto UI quanto chamadas diretas de API no mesmo
framework, e tem suporte maduro para Next.js.

Fluxos cobertos, em ordem de sensibilidade:

1. **Cálculo de saldo**, incluindo transferência entre contas (o
   invariante mais crítico do sistema desde o MVP).
2. **Orçamento** — cruzamento dos limiares de 80%/100%.
3. **Parcelamento e recorrência** — idempotência do job de postagem
   (rodando a função do job diretamente no teste, não esperando o
   agendamento real acontecer).
4. **Isolamento multiusuário** — tentar acessar dado de um household que
   o usuário de teste não pertence deve falhar consistentemente.
5. **Auditoria** — uma ação esperada gera a entrada de log correspondente.

## 4. Fases de Execução

1. Setup do Playwright + ambiente efêmero de banco no CI.
2. Testes do fluxo financeiro núcleo (saldo, transferência).
3. Testes de orçamento, parcelamento e recorrência.
4. Testes de isolamento multiusuário.
5. Integração como gate obrigatório no `ci.yml` (item 9).

## 5. Riscos e pontos de atenção

- **Suíte completa lenta desincentiva rodar em todo PR** — separar um
  subconjunto rápido (smoke test dos fluxos mais críticos) obrigatório em
  todo PR, e a suíte completa em um gatilho menos frequente (cron noturno
  ou imediatamente antes de um release).
- **Testes dependentes de tempo real são a fonte mais comum de teste
  instável (flaky)** — ex: testar uma parcela agendada esperando dias
  reais passarem. Controlar o tempo de forma determinística (mockar a
  data do sistema no teste) em vez de depender de tempo real decorrido.
- **Cobertura não é uma meta numérica nesta fase** — o objetivo é cobrir
  os fluxos que já causariam dano real se quebrassem silenciosamente, não
  perseguir uma porcentagem de cobertura de código.

## 6. Status no repositório

Suíte Playwright API-first em [`e2e/`](../e2e/), com Postgres efêmero no
CI (não no staging). Smoke obrigatório em todo PR; suíte completa no
cron noturno.

### 6.1 — Layout

| Caminho | Função |
|---|---|
| `e2e/smoke/` | Transferência/saldo + isolamento multiusuário (`@smoke`) |
| `e2e/full/` | Orçamento 80%/100%, jobs de parcelamento/recorrência, auditoria |
| `e2e/helpers/` | Client HTTP, workspace fresco por teste, trigger de jobs |
| `apps/api/src/run-e2e-job.ts` | Chama `PostingService` / `RecurringTransactionsService` fora do cron (`node dist/run-e2e-job.js`) |

Scripts: `pnpm test:e2e:smoke` e `pnpm test:e2e`.

### 6.2 — CI

| Workflow | Quando | O que faz |
|---|---|---|
| `ci.yml` job `e2e-smoke` | todo PR contra `main` | Postgres 16 → migrate → sobe API → smoke |
| `e2e-nightly.yml` | cron `0 5 * * *` + `workflow_dispatch` | mesma infra, suíte completa |

Variáveis do job: `COOKIE_SECURE=false`, `CRON_DISABLED=true`,
`THROTTLE_DISABLED=true`, JWT de teste. Cada spec registra usuários novos —
sem seed compartilhado.

### 6.3 — Rodar local

```bash
# Postgres local (docker compose da raiz) + .env com COOKIE_SECURE=false
pnpm db:migrate:deploy
COOKIE_SECURE=false CRON_DISABLED=true THROTTLE_DISABLED=true pnpm --filter @orcadom/api start
# outro terminal:
E2E_API_URL=http://127.0.0.1:8080 pnpm test:e2e:smoke
```

UI browser fica fora deste entregável; o foco são os invariantes
financeiros via API.
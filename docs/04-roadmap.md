# Roadmap de Execução

Quatro fases sequenciais. Cada fase tem um critério objetivo de "pronto"
para evitar avançar com uma base instável.

---

## Fase 1 — Setup

**Objetivo:** monorepo funcional com banco de dados acessível.

1. `pnpm init` na raiz + configurar `pnpm-workspace.yaml` e `turbo.json`.
2. Criar `docker-compose.yml` com o serviço `postgres` (e opcionalmente
   `adminer` para inspeção visual do banco).
3. Criar `packages/database`: instalar Prisma, definir o `schema.prisma`,
   rodar `npx prisma migrate dev --name init`.
4. Criar `packages/types` com o primeiro schema Zod (`Transaction`), para
   validar que o build entre pacotes do monorepo funciona corretamente.
5. Instalar Turborepo na raiz e validar que `turbo run build` enxerga os
   pacotes criados.

**Critério de fase pronta:** `docker compose up -d` sobe o banco,
`prisma studio` abre e mostra as tabelas vazias.

---

## Fase 2 — Banco e API

**Objetivo:** API funcional e testável via Swagger/Postman, sem frontend.

1. Scaffold do NestJS em `apps/api` (`nest new`), configurado para importar
   `@orcadom/database` como um `PrismaService` injetável.
2. Módulo `auth`: registro, login, estratégia JWT, refresh token, guard
   global aplicado a todas as rotas exceto `login`/`register`.
3. Módulo `accounts`: CRUD simples (ainda sem lógica de saldo).
4. Módulo `categories`: CRUD simples.
5. Módulo `transactions`: CRUD completo **com** a lógica de atualização de
   saldo dentro de `prisma.$transaction`:
   - `INCOME` → soma no `balance` da conta.
   - `EXPENSE` → subtrai do `balance` da conta.
   - `TRANSFER` → subtrai da conta de origem e soma na conta de destino,
     na mesma transação de banco.
6. Endpoint de dashboard: `GET /dashboard/summary?month=2026-09` retornando
   total de receitas, despesas, saldo consolidado e breakdown por
   categoria (via `groupBy` do Prisma).
7. Configurar Swagger para documentar os endpoints — essencial para
   integrar o frontend na fase seguinte sem ambiguidade.

**Critério de fase pronta:** via Swagger/Postman, é possível logar, criar
uma conta, lançar uma transação e confirmar que o saldo da conta mudou
corretamente — inclusive em cenários de transferência.

---

## Fase 3 — Frontend

**Objetivo:** fluxo completo utilizável via interface.

1. Scaffold do Next.js App Router em `apps/web`, com Tailwind configurado.
2. Telas de login/registro, consumindo a API e recebendo os cookies de
   sessão.
3. `middleware.ts` protegendo as rotas do grupo `(dashboard)`.
4. Setup do TanStack Query + client HTTP tipado (gerado a partir do Swagger
   com `openapi-typescript`, ou reaproveitando diretamente os schemas de
   `packages/types`).
5. Telas de CRUD, **nesta ordem** (porque transação depende das outras
   duas já existirem): Contas → Categorias → Transações.
6. Dashboard: cards de resumo (receitas, despesas, saldo) + gráfico simples
   de despesas por categoria do mês (ex: Recharts).

**Critério de fase pronta:** fluxo ponta a ponta funcional pela interface —
criar conta, criar categoria, lançar transação, ver refletido no dashboard.

---

## Fase 4 — Integração e Polimento

**Objetivo:** deixar o MVP robusto o suficiente para uso real (mesmo que
só pelo próprio desenvolvedor).

1. Tratamento de erros consistente: interceptor global no Nest retornando
   formato de erro padronizado; exibição de toast de erro no front.
2. Loading states e skeletons nas listagens e no dashboard.
3. Testes:
   - E2E da API cobrindo o fluxo de transação (módulo com mais regra de
     negócio).
   - Teste unitário do serviço responsável por calcular/atualizar saldo.
4. Documentar variáveis de ambiente (`.env.example` em cada app).
5. Revisão de segurança básica:
   - Rate limiting no endpoint de login.
   - Confirmar que nenhum endpoint aceita `userId` vindo do body/query —
     sempre extraído do JWT (ver
     [`03-decisoes-arquiteturais.md`](./03-decisoes-arquiteturais.md)).

**Critério de fase pronta:** o sistema pode ser usado no dia a dia sem
gerar inconsistência de saldo, sem exposição de dados entre usuários, e com
feedback visual adequado em erros e carregamentos.

---

## Por onde começar hoje

Fase 1, passos 1 e 2: configurar o monorepo e subir o Postgres via Docker.
É o que desbloqueia todo o resto e leva menos de 30 minutos.

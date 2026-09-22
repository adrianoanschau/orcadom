# Orcadom — Plano de MVP em Fases

Este documento detalha, etapa por etapa, o caminho de execução do MVP do
Orcadom. Cada fase tem um objetivo claro, uma lista de tarefas concretas
(marcáveis como checklist) e um critério de "pronto" que precisa ser
satisfeito antes de avançar para a fase seguinte.

> Pré-requisito: stack definida como NestJS + PostgreSQL + Prisma + Next.js
> (App Router) + Tailwind, em monorepo pnpm/Turborepo.

---

## Visão Geral das Fases

| Fase | Nome                     | Entrega                                      |
| ---- | ------------------------ | -------------------------------------------- |
| 0    | Setup do Monorepo        | Estrutura de pastas, Docker, banco acessível |
| 1    | Modelagem e Persistência | Schema Prisma migrado e validado             |
| 2    | Backend — Auth e Domínio | API completa, testável via Swagger           |
| 3    | Frontend — Fluxo Base    | Interface consumindo a API, CRUD completo    |
| 4    | Integração e Polimento   | Sistema pronto para uso real                 |

---

## Fase 0 — Setup do Monorepo

**Objetivo:** ter a estrutura do projeto criada e o banco de dados subindo
localmente, antes de escrever qualquer linha de lógica de negócio.

- [ ] Inicializar repositório Git.
- [ ] `pnpm init` na raiz.
- [ ] Criar `pnpm-workspace.yaml` apontando para `apps/*` e `packages/*`.
- [ ] Criar `turbo.json` com pipelines básicos (`build`, `dev`, `lint`, `test`).
- [ ] Criar `docker-compose.yml` com o serviço `postgres`.
- [ ] Criar `.env` a partir de um `.env.example` versionado.
- [ ] Rodar `docker compose up -d` e confirmar que o Postgres aceita conexões.
- [ ] Criar `packages/config` com `tsconfig.base.json` e config de ESLint
      compartilhada.

**Critério de fase pronta:** `docker compose up -d` sobe o banco sem erro,
e é possível conectar nele via DBeaver ou `psql`.

---

## Fase 1 — Modelagem e Persistência

**Objetivo:** o schema de dados existe, está migrado no banco, e o cliente
Prisma está pronto para ser consumido pela API.

- [ ] Criar `packages/database` com `package.json` próprio.
- [ ] Instalar Prisma (`prisma` como dev dependency, `@prisma/client` como
      dependency).
- [ ] Escrever `schema.prisma` com os models `User`, `Account`, `Category`
      e `Transaction` (ver `02-modelagem-dados.md` para o schema completo).
- [ ] Rodar `npx prisma migrate dev --name init` e confirmar a criação das
      tabelas.
- [ ] Criar `src/index.ts` no pacote exportando um `PrismaClient` singleton
      (evita múltiplas conexões em ambiente de desenvolvimento com hot reload).
- [ ] Criar `packages/types` e definir o primeiro schema Zod (ex:
      `createTransactionSchema`), validando que o build entre pacotes do
      monorepo funciona (`turbo run build` sem erro).
- [ ] (Opcional, recomendado) Criar um script de seed
      (`prisma/seed.ts`) com um usuário de teste e categorias padrão
      (Alimentação, Transporte, Salário, etc.), para não começar a testar a
      API com o banco totalmente vazio.

**Critério de fase pronta:** `prisma studio` abre, mostra as 4 tabelas, e
(se o seed foi criado) já existem dados de exemplo nelas.

---

## Fase 2 — Backend: Autenticação e Domínio

**Objetivo:** API HTTP completa e testável via Swagger, cobrindo os 5
módulos do escopo — sem nenhuma interface gráfica ainda.

### 2.1 — Scaffold e infraestrutura da API

- [ ] `nest new apps/api` (ou configuração manual equivalente dentro do
      monorepo).
- [ ] Criar `PrismaModule`/`PrismaService` em `src/common/`, injetando o
      cliente do pacote `@orcadom/database`.
- [ ] Configurar `ValidationPipe` global e integração com `nestjs-zod`
      para validar DTOs a partir dos schemas de `@orcadom/types`.
- [ ] Configurar Swagger (`@nestjs/swagger`) disponível em `/api/docs`.
- [ ] Configurar CORS liberando a origem do frontend (`localhost:3000`).

### 2.2 — Módulo `auth`

- [ ] Endpoint `POST /auth/register` (nome, e-mail, senha — hash com
      `bcrypt`).
- [ ] Endpoint `POST /auth/login` (retorna `accessToken` e `refreshToken`
      como cookies `httpOnly`).
- [ ] Endpoint `POST /auth/refresh` (gera novo `accessToken` a partir do
      `refreshToken` válido).
- [ ] Endpoint `POST /auth/logout` (limpa os cookies).
- [ ] `JwtStrategy` (Passport) validando o `accessToken`.
- [ ] `JwtAuthGuard` aplicado globalmente, com decorator `@Public()` para
      liberar as rotas de `register`/`login`.
- [ ] Decorator `@CurrentUser()` para extrair o `userId` do token dentro
      dos controllers (nunca aceitar `userId` vindo do body/query).

### 2.3 — Módulo `accounts`

- [ ] `POST /accounts` — criar conta (nome, tipo, saldo inicial opcional).
- [ ] `GET /accounts` — listar contas do usuário logado.
- [ ] `GET /accounts/:id` — detalhe de uma conta.
- [ ] `PATCH /accounts/:id` — editar nome/cor.
- [ ] `DELETE /accounts/:id` — excluir (bloquear se houver transações
      vinculadas, ou decidir estratégia de cascade — documentar a escolha).

### 2.4 — Módulo `categories`

- [ ] `POST /categories` — criar categoria (nome, tipo INCOME/EXPENSE).
- [ ] `GET /categories` — listar, com filtro opcional por `type`.
- [ ] `PATCH /categories/:id` — editar.
- [ ] `DELETE /categories/:id` — excluir (mesma decisão de cascade/bloqueio
      do item anterior).

### 2.5 — Módulo `transactions` (núcleo do domínio)

- [ ] `POST /transactions` com lógica ramificada por `type`:
  - `INCOME`/`EXPENSE`: exige `accountId` e `categoryId`; atualiza
    `balance` da conta dentro de `prisma.$transaction`.
  - `TRANSFER`: exige `fromAccountId` e `toAccountId`; subtrai da origem
    e soma no destino, ambos dentro da mesma `prisma.$transaction`.
- [ ] `GET /transactions` com filtros por `accountId`, `categoryId`,
      intervalo de datas e paginação.
- [ ] `PATCH /transactions/:id` — editar, recalculando o impacto no saldo
      (reverter o efeito antigo antes de aplicar o novo, na mesma
      transação de banco).
- [ ] `DELETE /transactions/:id` — excluir, revertendo o efeito no saldo.
- [ ] Testar manualmente cenário de borda: exclusão de uma transação de
      transferência precisa reverter saldo nas **duas** contas envolvidas.

### 2.6 — Módulo `dashboard`

- [ ] `GET /dashboard/summary?month=YYYY-MM`:
  - Total de receitas do mês.
  - Total de despesas do mês.
  - Saldo consolidado (soma do `balance` de todas as contas).
  - Breakdown de despesas por categoria (via `groupBy` do Prisma).

**Critério de fase pronta:** usando o Swagger, é possível fazer login,
criar uma conta, uma categoria, lançar uma receita, uma despesa e uma
transferência, e confirmar que os saldos refletem corretamente — inclusive
após editar e excluir lançamentos.

---

## Fase 3 — Frontend: Fluxo Base

**Objetivo:** interface funcional cobrindo o mesmo escopo já validado no
backend.

### 3.1 — Scaffold e autenticação

- [ ] `create-next-app` (App Router) em `apps/web`, com Tailwind.
- [ ] Configurar cliente HTTP (`fetch` wrapper) apontando para
      `NEXT_PUBLIC_API_URL`, com `credentials: 'include'` para os cookies.
- [ ] Página `/login` e `/register` (grupo de rota `(auth)`).
- [ ] `middleware.ts` protegendo o grupo `(dashboard)`, redirecionando
      para `/login` se não houver sessão válida.
- [ ] Configurar `QueryClientProvider` (TanStack Query) no layout raiz.

### 3.2 — Contas

- [ ] Listagem de contas com saldo (`/accounts`).
- [ ] Formulário de criação/edição (modal ou rota dedicada), validado com
      o schema Zod de `@orcadom/types`.
- [ ] Ação de exclusão com confirmação.

### 3.3 — Categorias

- [ ] Listagem separada por tipo (Receita / Despesa).
- [ ] Formulário de criação/edição.
- [ ] Ação de exclusão com confirmação.

### 3.4 — Transações

- [ ] Listagem paginada, com filtro por conta, categoria e período.
- [ ] Formulário de lançamento — campo `type` (Receita/Despesa/Transferência)
      alterando dinamicamente quais campos aparecem (categoria só faz
      sentido para receita/despesa; conta de origem/destino só para
      transferência).
- [ ] Edição e exclusão de lançamentos.

### 3.5 — Dashboard

- [ ] Cards de resumo: total de receitas, despesas e saldo do mês
      selecionado.
- [ ] Seletor de mês/ano.
- [ ] Gráfico de despesas por categoria (ex: `recharts`, gráfico de pizza
      ou barras).
- [ ] Estado vazio tratado (usuário novo, sem transações ainda).

**Critério de fase pronta:** um usuário novo consegue, sem tocar em nada
além da interface: se cadastrar, logar, criar uma conta, uma categoria,
lançar transações variadas e ver o dashboard refletir os números
corretamente.

---

## Fase 4 — Integração e Polimento

**Objetivo:** fechar lacunas que inviabilizariam o uso real do sistema no
dia a dia, mesmo que apenas pelo próprio desenvolvedor.

- [ ] Interceptor global de erros no Nest, retornando formato padronizado
      (`{ statusCode, message, error }`).
- [ ] Tratamento desses erros no front (toast/alert), evitando telas
      brancas ou erros não capturados.
- [ ] Loading states (skeletons) nas listagens e no dashboard.
- [ ] Testes e2e da API cobrindo o fluxo de transação (criação, edição e
      exclusão, incluindo transferências).
- [ ] Teste unitário do serviço de cálculo/atualização de saldo.
- [ ] Rate limiting no endpoint de login (`@nestjs/throttler`).
- [ ] Auditoria final: nenhum endpoint deve aceitar `userId` vindo do
      body/query — sempre extraído do token.
- [ ] Revisão de responsividade básica das telas (uso em mobile).
- [ ] `.env.example` atualizado em cada app, refletindo todas as variáveis
      realmente usadas.

**Critério de fase pronta:** o sistema pode ser usado continuamente sem
gerar inconsistência de saldo, sem expor dados entre usuários diferentes, e
com feedback visual adequado em erros e carregamentos — ou seja, pronto
para ser considerado a versão 1.0 do MVP.

---

## Ordem sugerida de execução dentro de cada fase

Dentro das Fases 2 e 3, seguir sempre a ordem: **Auth → Contas →
Categorias → Transações → Dashboard**. Essa ordem não é arbitrária —
cada módulo depende dos anteriores existirem (transação precisa de conta e
categoria; dashboard precisa de transações para agregar).

## Por onde começar

Fase 0, do início ao fim, é o primeiro passo literal: sem o monorepo e o
banco no ar, nenhuma das fases seguintes pode começar.

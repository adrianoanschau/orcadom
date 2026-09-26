# Metas de Economia

> Detalhamento do item 2 do [roadmap para a 1.0](./15-roadmap-v1.md).
> Depende de `Account` e `Transaction` (tipo `TRANSFER`) já existentes —
> nenhuma alteração de schema nessas duas tabelas é necessária. Escopado
> por `householdId`, já que Multiusuário (`13`) está implementado antes
> desta feature.

## 1. Objetivo

Permitir que o usuário (ou household) defina uma meta de valor a guardar,
opcionalmente até uma data, e acompanhe o progresso de forma automática —
sem precisar registrar manualmente "quanto já guardei", da mesma forma
que orçamento (`09`) não exige que o usuário some seus próprios gastos.

## 2. Decisão central: meta é sobre uma conta, progresso é sobre transferência

A primeira pergunta de modelagem é de onde vem o "quanto já foi guardado".
Três abordagens foram consideradas:

| Abordagem | Como funciona | Por que não |
|---|---|---|
| Ledger manual da meta | Usuário digita "guardei R$ 200 hoje" direto na tela da meta | Desconectado do dinheiro real — vira um segundo lugar para mentir sobre o próprio saldo, o oposto do que o Orcadom tenta resolver desde o MVP |
| Novo tipo de transação (`SAVINGS_CONTRIBUTION`) | Criar um `TransactionType` novo só para aportes | Não é necessário — o sistema já tem um jeito de mover dinheiro entre contas: `TRANSFER` |
| **Meta vinculada a uma conta + progresso = transferências para essa conta** | O usuário aponta uma conta (ex: "Poupança") como destino da meta; toda `TRANSFER` para essa conta soma progresso, toda `TRANSFER` para fora subtrai | Reaproveita 100% do que já existe, sem tocar em `Transaction` |

A terceira abordagem foi adotada. **Progresso de uma meta é o saldo
líquido de transferências para dentro/fora da conta vinculada, desde a
data de início da meta** — não o saldo total da conta, e não uma tabela
paralela de "aportes".

```ts
progresso = SUM(TRANSFER.amount WHERE toAccountId = meta.accountId AND date >= meta.startDate)
          - SUM(TRANSFER.amount WHERE fromAccountId = meta.accountId AND date >= meta.startDate)
```

### 2.1 — Por que essa fórmula funciona mesmo em conta compartilhada

Uma preocupação natural: e se a conta vinculada à meta também recebe
`INCOME`/`EXPENSE` do dia a dia (não é uma poupança dedicada)? A fórmula
acima **ignora** `INCOME` e `EXPENSE` — só conta `TRANSFER`. Isso significa
que gastar no cartão vinculado a essa conta, ou receber salário nela, não
distorce o progresso da meta; só uma transferência deliberada (entrada ou
saída) afeta o número. Ainda assim, **a recomendação de uso** é uma conta
dedicada por meta — não é uma exigência do sistema, mas evita confusão do
usuário ao olhar "quanto tenho na conta" vs. "quanto contei pra meta"
(seção 8).

**Retirar dinheiro da conta reduz o progresso — isso é intencional, não um
bug.** Se o usuário guardou R$ 500 para uma viagem e depois transferiu
R$ 200 de volta para a conta corrente, a meta corretamente regride para
R$ 300 guardados. Esconder isso seria mentir sobre o progresso real.

## 3. Modelagem de Dados

```prisma
enum SavingsGoalStatus {
  ACTIVE
  COMPLETED
  ABANDONED
}

model SavingsGoal {
  id           String            @id @default(uuid())
  name         String
  targetAmount Decimal           @db.Decimal(12, 2)
  targetDate   DateTime?         // opcional — meta pode não ter prazo definido
  startDate    DateTime          @default(now()) // a partir de quando transferências contam
  status       SavingsGoalStatus @default(ACTIVE)
  createdAt    DateTime          @default(now())
  completedAt  DateTime?

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  accountId String
  account   Account @relation(fields: [accountId], references: [id])

  @@index([householdId, status])
  @@map("savings_goals")
}
```

Nenhuma alteração em `Transaction` — o vínculo entre uma transferência e
uma meta é sempre calculado (por `accountId` + intervalo de data), nunca
armazenado como uma referência direta. Isso evita um campo
`savingsGoalId` em `Transaction` que precisaria ser preenchido
manualmente pelo usuário a cada transferência, algo fácil de esquecer.

**Sobre `startDate` ser separado de `createdAt`:** por padrão os dois
coincidem, mas `startDate` é editável — permite ao usuário criar uma meta
hoje e decidir que ela "já valia" a partir de uma data anterior (ex:
começou a guardar em janeiro, só cadastrou a meta em março).

## 4. Cálculo de progresso e conclusão automática

```ts
async function getGoalProgress(goal: SavingsGoal) {
  const { _sum: inSum } = await prisma.transaction.aggregate({
    where: { toAccountId: goal.accountId, type: 'TRANSFER', date: { gte: goal.startDate } },
    _sum: { amount: true },
  });
  const { _sum: outSum } = await prisma.transaction.aggregate({
    where: { fromAccountId: goal.accountId, type: 'TRANSFER', date: { gte: goal.startDate } },
    _sum: { amount: true },
  });

  const saved = (inSum.amount ?? new Prisma.Decimal(0)).minus(outSum.amount ?? new Prisma.Decimal(0));
  const ratio = saved.dividedBy(goal.targetAmount).toNumber();

  return { saved, ratio, remaining: goal.targetAmount.minus(saved) };
}
```

Quando uma transferência é criada e a conta de destino corresponde a uma
`SavingsGoal` `ACTIVE`, o mesmo ponto do código que já recalcula saldo
(módulo `transactions`) verifica se o progresso atingiu `targetAmount` pela
primeira vez. Se sim: `status` vira `COMPLETED`, `completedAt` é
preenchido, e um evento de domínio é emitido:

```ts
eventEmitter.emit('savings-goal.completed', { householdId, goalId, name, targetAmount });
```

Seguindo exatamente o mesmo padrão já estabelecido por
`budget.threshold_crossed` (`09-orcamentos.md`) — o módulo de
Notificações (`10`) já sabe fazer fan-out de evento para todos os membros
do household (ajuste feito em `13-multiusuario.md`, seção 8), então esta
feature só precisa emitir o evento; nenhuma mudança no módulo de
notificações é necessária.

## 5. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /savings-goals` | Cria a meta (nome, valor alvo, prazo opcional, conta vinculada) |
| `GET /savings-goals` | Lista metas do household, cada uma já com `saved`, `ratio` e `remaining` calculados |
| `GET /savings-goals/:id` | Detalhe da meta + histórico de transferências que compõem o progresso (mesma query da seção 4, sem agregação — lista as linhas) |
| `PATCH /savings-goals/:id` | Edita nome, valor alvo ou prazo |
| `PATCH /savings-goals/:id/abandon` | Marca como `ABANDONED` sem excluir — preserva o histórico já ocorrido |
| `DELETE /savings-goals/:id` | Remove a meta em si (nunca as transferências, que continuam existindo como transações normais) |

## 6. Frontend

### 6.1 — Tela `/savings-goals`

- Lista de metas ativas, cada uma com:
  - Nome, valor alvo, prazo (quando definido).
  - Barra de progresso — reaproveitando o **mesmo componente** já usado em
    orçamento e parcelamento (consolidação já prevista em
    `18-revisao-design-ux.md`, seção 6).
  - `R$ 1.200,00 de R$ 5.000,00 guardados` +, quando há prazo,
    `faltam 45 dias`.
- Metas concluídas (`COMPLETED`) aparecem em uma seção separada, sem barra
  de progresso ativa — só a confirmação de conclusão.

### 6.2 — Detalhe da meta

- Linha do tempo das transferências que compõem o progresso (entradas em
  verde/`income`, saídas em vermelho/`expense` — mesmas cores semânticas
  já estabelecidas, nenhuma cor nova).
- Ação de editar valor alvo/prazo, e de abandonar a meta.

### 6.3 — Dashboard

- Card "Metas de economia": mostra as metas mais próximas da conclusão ou
  do prazo, sem abrir uma tela nova — mesmo padrão já usado pelo card de
  orçamento e pelo de "Compromissos futuros" (parcelamento/recorrência).

## 7. Fases de Execução

### Fase 1 — Modelagem e cálculo

- [x] Migration com `SavingsGoal` e `SavingsGoalStatus`.
- [x] Função `getGoalProgress()`, com testes cobrindo: meta sem nenhuma
      transferência ainda, meta com entradas e saídas, meta que já
      atingiu o alvo.
- [x] Lógica de conclusão automática (`COMPLETED` + emissão de
      `savings-goal.completed`) acoplada ao fluxo de criação de
      `TRANSFER` já existente no módulo `transactions`.

### Fase 2 — API

- [x] `POST /savings-goals`, `GET /savings-goals`,
      `GET /savings-goals/:id` (com histórico).
- [x] `PATCH /savings-goals/:id`, `PATCH /savings-goals/:id/abandon`,
      `DELETE /savings-goals/:id`.

### Fase 3 — Frontend

- [x] Tela `/savings-goals` com lista e barra de progresso reaproveitada.
- [x] Detalhe da meta com linha do tempo de transferências.
- [x] Card "Metas de economia" no dashboard.

## 8. Riscos e pontos de atenção

- **Conta compartilhada entre metas ou entre meta e uso geral não quebra
  o cálculo** (seção 2.1), mas pode confundir o usuário ao olhar o saldo
  da conta e não bater com o progresso mostrado na meta — vale um aviso
  na UI de criação da meta recomendando conta dedicada, sem impedir o
  usuário de usar uma conta compartilhada se preferir.
- **Duas metas ativas na mesma conta somam progresso de forma
  independente, mas competem pelo mesmo dinheiro na prática** — o sistema
  não impede duas metas ativas apontando para a mesma conta (não há
  motivo técnico para bloquear), mas isso pode gerar a falsa sensação de
  "tenho esse valor guardado duas vezes". Registrado como limitação
  conhecida, não como validação a ser bloqueada nesta versão.
- **Meta com prazo vencido e não concluída não é tratada automaticamente**
  (não vira `ABANDONED` sozinha) — fica `ACTIVE` indefinidamente até o
  usuário decidir o que fazer. Comportamento intencional: o sistema não
  deveria presumir que o usuário desistiu só porque a data passou.

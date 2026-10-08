# Contas a Pagar

> **Item 15** de [`15-roadmap-v1.md`](./15-roadmap-v1.md), acrescentado
> depois do roadmap fechado. Depende apenas do que já existe:
> `transactions` (saldo), Recorrência
> ([`12-recorrencia.md`](./12-recorrencia.md)), Multiusuário (`13`),
> Auditoria (`14`) e Permissão Granular por Conta (`25`).
>
> **Posição de execução:** logo depois do Onboarding (item 3), antes de
> Exportar Relatórios. A numeração "15" é só identificador; o roadmap
> explica por que os itens existentes não foram renumerados.
>
> **Complemento obrigatório:**
> [`36-importacao-conciliacao-contas-a-pagar.md`](./36-importacao-conciliacao-contas-a-pagar.md)
> torna a importação de extrato resiliente a esta feature. Os dois vão no
> mesmo Release PR — sem o `36`, marcar como paga e importar o extrato
> duplica o lançamento.

## 1. Objetivo

Um **checklist de contas do mês**: a pessoa vê o que vence, o que já foi
pago e o que está atrasado. Ao marcar uma conta como paga, o sistema cria
sozinho o lançamento correspondente — sem digitar duas vezes e sem o
checklist e o extrato divergirem.

## 2. Decisão central: conta a pagar só vira lançamento quando é paga

| Abordagem | Como funciona | Por que não / por que sim |
|---|---|---|
| A — Conta a pagar como `Transaction` `SCHEDULED` | Cada conta é uma transação futura; "pagar" promove para `POSTED` | `SCHEDULED` é promovida pelo job diário **pela data** (`11`, seção 5.1): o saldo seria debitado no vencimento mesmo sem a pessoa ter pago, e se a conta atrasa o saldo mente. Aqui "pago" é um fato confirmado por uma pessoa, não uma data |
| **B — `Bill` própria; pagar cria a `Transaction`** | A conta é um item de checklist sem efeito financeiro; só ao marcar como paga nasce um lançamento | **Adotada.** O saldo só muda quando o dinheiro de fato saiu |

Consequências diretas:

- Conta pendente **não** mexe em saldo, nos totais do painel nem em
  orçamento (que só soma `Transaction`). O painel ganha um bloco próprio.
- Ela também **não** entra em "Compromissos futuros" (que soma
  `SCHEDULED`): dois cards, duas naturezas — parcela/recorrência
  automática vs. conta que depende de uma ação.

### 2.1 — Pagar usa o mesmo serviço de criação de transação

Pagar uma conta **não** é um caminho paralelo: chama o mesmo ponto de
criação usado por `POST /transactions` (mesmo princípio de `07`). Por isso
vêm de graça, sem código novo: atualização de saldo em
`prisma.$transaction`, `CategoryMemory`, evento
`budget.threshold_crossed`, conclusão de meta (`19`) e auditoria (`14`).

## 3. Decisão: contas recorrentes reaproveitam o motor de `12`

Aluguel, condomínio, internet e a fatura do cartão se repetem todo mês. Sem
recorrência, o checklist vira digitação mensal.

| Opção | Como funciona | Trade-off |
|---|---|---|
| Sem recorrência | Cada conta é digitada à mão | Ninguém sustenta isso por mais de dois meses |
| `BillTemplate` próprio | Nova tabela, job e tela, duplicando frequência, dia do mês e ajuste de fim de mês | Duas telas de "coisas que se repetem" com regras quase iguais; a pessoa não saberia qual usar |
| **Modo em `RecurringTransaction`** | Campo `mode`: `AUTO_POST` (comportamento atual) ou `BILL` | **Adotada.** Reaproveita frequência, `dayOfMonth`, pausa/retomada e a tela `/recurring`. A escolha vira uma pergunta clara: *lançar sozinho na data* ou *criar uma conta a pagar para eu confirmar* |

Regra prática para a UI: débito automático (a pessoa não faz nada) →
`AUTO_POST`. Boleto ou qualquer coisa que exige uma ação → `BILL`.

## 4. Modelagem de Dados

```prisma
enum BillStatus {
  PENDING   // a pagar — inclui as vencidas; "atrasada" é estado derivado (seção 5)
  PAID      // paga — existe uma Transaction vinculada
  CANCELED  // não será paga (ex.: mês em que a assinatura foi suspensa)
}

enum BillSettlement {
  GENERATED // o lançamento nasceu do pagamento pela conta — desfazer o exclui
  LINKED    // o lançamento já existia (manual ou do extrato) e foi vinculado — desfazer só desvincula
}

model Bill {
  id          String     @id @default(uuid())
  description String
  amount      Decimal    @db.Decimal(12, 2) // valor previsto; o real é confirmado ao pagar
  dueDate     DateTime   @db.Date            // só data, sem hora (ver seção 13, fuso)
  status      BillStatus @default(PENDING)
  notes       String?
  createdAt   DateTime   @default(now())
  updatedAt   DateTime   @updatedAt

  householdId String
  household   Household @relation(fields: [householdId], references: [id], onDelete: Cascade)

  // Conta que costuma pagar esta conta — só pré-seleciona o campo ao pagar
  accountId String?
  account   Account? @relation("BillPayingAccount", fields: [accountId], references: [id], onDelete: SetNull)

  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id], onDelete: SetNull)

  // Se preenchido, pagar = TRANSFERÊNCIA para esta conta (fatura de cartão), não despesa
  targetAccountId String?
  targetAccount   Account? @relation("BillTargetAccount", fields: [targetAccountId], references: [id], onDelete: Restrict)

  recurringTransactionId String?
  recurringTransaction   RecurringTransaction? @relation(fields: [recurringTransactionId], references: [id], onDelete: SetNull)

  transactionId String?         @unique // 1 lançamento ↔ no máximo 1 conta
  transaction   Transaction?    @relation(fields: [transactionId], references: [id], onDelete: SetNull)
  settlement    BillSettlement? // preenchido sempre que status = PAID (ver seção 6.3)

  @@unique([recurringTransactionId, dueDate]) // NULL é distinto no Postgres: contas avulsas não colidem
  @@index([householdId, dueDate])
  @@index([householdId, status, dueDate])
  @@map("bills")
}
```

Alterações em models existentes (relações inversas omitidas):

```prisma
enum RecurrenceMode {
  AUTO_POST // comportamento atual (12): gera Transaction sozinha
  BILL      // gera uma Bill pendente; a pessoa confirma o pagamento
}

// RecurringTransaction ganha:
//   mode            RecurrenceMode @default(AUTO_POST)
//   targetAccountId String?   // só válido com mode = BILL (fatura de cartão); relação com Account, Restrict
//   bills           Bill[]
//
// Transaction ganha (só a relação inversa, nenhuma coluna nova):
//   bill            Bill?
```

`@default(AUTO_POST)` preserva todas as recorrências existentes — **sem
backfill**. Validações no schema Zod de `packages/types`: `mode = BILL`
exige `type = EXPENSE`; `targetAccountId` só com `BILL` e diferente de
`accountId`.

**Sobre `onDelete`:** `accountId` e `categoryId` são só sugestões de
preenchimento, então `SetNull` basta (o diálogo de pagamento pede o que
faltar). `targetAccountId` é `Restrict` de propósito: se a conta de cartão
sumisse, uma conta que era transferência viraria despesa em silêncio e
dobraria o gasto (seção 6.4). O service traduz o erro em mensagem clara
("há contas a pagar apontando para esta conta").

## 5. Estados: o que é armazenado e o que é derivado

Só `PENDING`/`PAID`/`CANCELED` são gravados. "Atrasada" e "vence em breve"
são **calculados** na leitura — mesmo princípio de `20` (progresso
derivado): nenhum job precisa virar status de madrugada, e nenhum status
fica desatualizado se o job falhar.

| Gravado | Condição (hoje em `America/Sao_Paulo`) | Exibição | Tom do `StatusBadge` |
|---|---|---|---|
| `PENDING` | `dueDate < hoje` | Atrasada | `expense` |
| `PENDING` | `hoje ≤ dueDate ≤ hoje + 3` | Vence hoje / amanhã / em N dias | `pending` |
| `PENDING` | `dueDate > hoje + 3` | A pagar | `neutral` |
| `PAID` | — | Paga | `income` |
| `CANCELED` | — | Cancelada | `neutral` |

Reaproveita o precedente de `09-orcamentos.md` (seção 6): tokens
semânticos já existentes no `StatusBadge`, sem cor nova. A janela de 3
dias é constante de aplicação (`BILL_DUE_SOON_DAYS`), não schema.

**"Hoje" é calculado em `America/Sao_Paulo`, nunca em UTC.** Às 22h em
Porto Alegre já é o dia seguinte em UTC; uma conta que vence hoje
apareceria como atrasada. É a mesma convenção dos crons.

## 6. Pagar uma conta

### 6.1 — Fluxo atômico

```ts
async function payBill(householdId: string, billId: string, actor: Actor, input: PayBillDto) {
  const result = await prisma.$transaction(async (trx) => {
    // Trava a linha: duplo clique ou duas abas pagando a mesma conta ficam em fila.
    await trx.$queryRaw`
      SELECT id FROM bills WHERE id = ${billId} AND "householdId" = ${householdId} FOR UPDATE
    `;

    const bill = await trx.bill.findFirst({ where: { id: billId, householdId } });
    if (!bill) throw new NotFoundException();
    await assertBillAccessible(bill, actor);               // seção 8
    if (bill.status !== 'PENDING') throw new ConflictException('Conta não está pendente');

    const { transaction, events } = await transactionsService.createWithin(
      trx, householdId, actor.userId, buildTransactionInput(bill, input), // seção 6.2
    );

    await trx.bill.update({
      where: { id: bill.id },
      data: { status: 'PAID', transactionId: transaction.id, settlement: 'GENERATED' },
    });
    return { billId: bill.id, transactionId: transaction.id, events };
  });

  // Eventos de domínio SÓ depois do commit (ver nota abaixo).
  result.events.forEach((e) => eventEmitter.emit(e.name, e.payload));
  return result;
}
```

**Refatoração necessária no módulo `transactions`:** a lógica de criação
(saldo + memória de categoria + checagem de orçamento e de meta) passa a
existir como `createWithin(trx, ...)`, que recebe o client transacional.
`POST /transactions` continua abrindo a própria `prisma.$transaction` em
volta dela. `createWithin` **devolve** os eventos pendentes
(`budget.threshold_crossed`, `savings-goal.completed`) em vez de emiti-los:
se o pagamento der rollback depois, nenhum aviso de "orçamento estourado"
pode ter saído por um pagamento que não aconteceu. O mesmo vale para o
`deleteWithin` da seção 6.3.

`Bill.transactionId @unique` é a segunda barreira: mesmo se o lock falhar
por algum bug, o banco recusa dois pagamentos apontando para o mesmo
lançamento.

### 6.2 — Regras do pagamento

| Campo | Padrão | Regra |
|---|---|---|
| `accountId` | `bill.accountId` | Obrigatório no final; precisa estar entre as contas acessíveis ao membro (`25`) |
| `amount` | `bill.amount` | Pode ser diferente do previsto (conta de luz). O lançamento grava o valor real; `Bill.amount` continua sendo o previsto |
| `date` | hoje | **Não pode ser futura**: lançamento manual afeta o saldo na criação, então uma data futura faria o saldo divergir da data |
| `categoryId` | `bill.categoryId` | Obrigatório quando **não** há `targetAccountId` |

Resultado: `EXPENSE` na conta escolhida, com `description` da conta,
`userId` de quem pagou (mesma semântica de "quem lançou", `13`) e
`source = MANUAL`. Com `targetAccountId`, vira `TRANSFER` (seção 6.4).
Valor e data pagos **não são duplicados** na `Bill`: são lidos da
`Transaction` vinculada, para existir uma única fonte da verdade.

**Travas no módulo `transactions` para lançamentos vinculados a uma conta
(`GENERATED` ou `LINKED`):** o `type` não pode ser alterado
(EXPENSE → INCOME deixaria a conta "paga" por um lançamento que não é
pagamento). Valor, data, conta e categoria continuam editáveis
normalmente.

### 6.3 — Desfazer pagamento e exclusão do lançamento

Marcar sem querer é o erro mais provável de um checklist, então desfazer
é de primeira classe:

- `POST /bills/:id/unpay` depende de como a conta foi paga
  (`settlement`):
  - `GENERATED` (o lançamento nasceu do pagamento): exclui o lançamento
    pelo **mesmo fluxo** de `DELETE /transactions/:id` (que já reverte o
    saldo, inclusive nas duas pontas de uma transferência) e devolve a
    conta para `PENDING`, tudo em uma `prisma.$transaction`.
  - `LINKED` (o lançamento já existia — digitado à mão ou vindo do extrato
    — e foi vinculado, ver `36`): **só desvincula**. O lançamento
    permanece: excluí-lo apagaria algo que a pessoa não criou pelo
    checklist e, se veio do extrato, a linha reapareceria na próxima
    importação.
- A regra "conta volta a pendente" vive **num lugar só**: dentro do
  `deleteWithin` de `transactions`. Se existir `Bill` vinculada à
  transação excluída, ela vira `PENDING` com `transactionId` e
  `settlement` nulos na mesma transação de banco. Assim, apagar o
  lançamento direto em `/transactions` tem o mesmo efeito que desfazer
  pelo checklist, e o invariante **`PAID` ⇔ `transactionId` e
  `settlement` preenchidos** nunca quebra.

### 6.4 — Fatura de cartão: pagar é transferência, não despesa

As compras do cartão já foram (ou serão) lançadas como `EXPENSE` na conta
`CREDIT_CARD`. Se a fatura virasse outra `EXPENSE`, o gasto seria contado
duas vezes. Por isso, quando `targetAccountId` aponta para uma conta de
cartão, o pagamento cria uma **`TRANSFER`** da conta pagadora para o
cartão: o saldo do banco cai, a dívida do cartão diminui, e nenhuma
despesa nova aparece em totais ou orçamento.

Isso fecha, para o caminho manual, a lacuna registrada em
[`11-parcelamento.md`](./11-parcelamento.md) (seção 10: pagamento de
fatura "não modelado"). O ciclo de fechamento do cartão continua fora de
escopo — o vencimento é a data que a pessoa informa.

## 7. Recorrência em modo `BILL`

O job `generateDueRecurringOccurrences()` (`12`, seção 6) ganha um ramo:
templates em `AUTO_POST` seguem **inalterados**; templates em `BILL`
geram contas.

```ts
const BILL_GENERATION_HORIZON_DAYS = 30; // constante de aplicação

async function generateBillsWithinHorizon(recurring: RecurringTransaction) {
  const horizon = addDays(todayInSaoPaulo(), BILL_GENERATION_HORIZON_DAYS);
  let cursor = await getLastBillDueDate(recurring.id); // qualquer status, inclusive CANCELED
  let next = calculateNextOccurrenceDate(recurring, cursor);

  while (next <= horizon && (!recurring.endDate || next <= recurring.endDate)) {
    try {
      await prisma.bill.create({
        data: {
          householdId: recurring.householdId,
          description: recurring.description,
          amount: recurring.amount,
          dueDate: next,
          accountId: recurring.accountId,
          categoryId: recurring.categoryId,
          targetAccountId: recurring.targetAccountId,
          recurringTransactionId: recurring.id,
        },
      });
    } catch (err) {
      if (!isUniqueConstraintViolation(err)) throw err; // já gerada: seguir adiante
    }
    cursor = next;
    next = calculateNextOccurrenceDate(recurring, cursor);
  }
}
```

Pontos que diferem do ramo `AUTO_POST`:

- **Horizonte de 30 dias, em vez de 3.** O checklist precisa mostrar o mês
  inteiro, não só o que vence esta semana. A query de templates ativos é
  ampliada para esse horizonte; o ramo `AUTO_POST` continua aplicando o
  seu próprio corte de 3 dias.
- **Laço `while`, não uma ocorrência por execução.** Com o ramo atual,
  cada execução geraria uma única ocorrência; aqui uma execução gera tudo
  que cabe na janela — e também recupera atrasos se a API ficou fora do ar
  (o risco já registrado em `12`, seção 10).
- `calculateNextOccurrenceDate` passa a receber a **última data gerada**
  como parâmetro (para `BILL` vinda de `bills`; para `AUTO_POST`, de
  `transactions`, como hoje). Com `cursor = null` parte de `startDate`.
- O job define o contexto de auditoria como hoje
  (`source: 'CRON_RECURRING'`, `actorUserId` nulo).

Comportamento dos endpoints de `/recurring-transactions` (`12`, seção 7)
para `mode = BILL`:

| Ação | Efeito |
|---|---|
| `POST` | Gera **imediatamente** todas as contas dentro do horizonte (não só a primeira) |
| `PATCH` | Prospectivo, como já é: afeta contas geradas **depois**; as `PENDING` já geradas mantêm o valor com que nasceram (ver seção 13) |
| `pause` / `resume` | Para / retoma a geração; contas já criadas permanecem |
| `DELETE` | Desativa e **cancela** (`CANCELED`) as contas `PENDING` com vencimento **futuro**. Atrasadas e pagas permanecem — uma atrasada ainda é uma obrigação real, espelhando "parcelas já `POSTED` não são revertidas" (`11`) |

## 8. Permissão por conta

`Bill` é um **novo ponto de leitura** escopado por conta — exatamente o
tipo de lugar onde `25` avisa que o filtro costuma ser esquecido. Regra:
uma conta a pagar é visível se **todas** as contas ligadas a ela
(`accountId`, `targetAccountId`) forem acessíveis ao membro; contas sem
nenhuma conta ligada são visíveis a todo o household.

```ts
const ids = await getAccessibleAccountIds(householdId, memberId);
const visible = {
  householdId,
  AND: [
    { OR: [{ accountId: null }, { accountId: { in: ids } }] },
    { OR: [{ targetAccountId: null }, { targetAccountId: { in: ids } }] },
  ],
};
```

Vale para listagem, detalhe, `summary`, painel e qualquer ação por `:id`
(um membro sem acesso recebe `404`, não `403`, para não confirmar que a
conta existe). Os totais do card do painel passam a ser **por usuário**, na
mesma lógica do saldo consolidado (`25`, seção 7).

## 9. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /bills` | Cria conta avulsa (descrição, valor previsto, vencimento; conta, categoria, `targetAccountId` e observação opcionais) |
| `GET /bills?month=YYYY-MM&includeOverdue=true` | Checklist do mês, mais as `PENDING` de meses anteriores quando `includeOverdue`. Cada item traz estado de exibição, `daysUntilDue` e, se paga, `payment: { transactionId, amount, date }` lido da `Transaction`. `CANCELED` fica oculta (`includeCanceled=true` mostra) |
| `GET /bills/summary?month=YYYY-MM` | Contagens e somas (pagas, pendentes, atrasadas) para o card do painel |
| `GET /bills/:id` | Detalhe, com histórico de auditoria |
| `PATCH /bills/:id` | Edita descrição, valor, vencimento, conta, categoria, alvo e observação — só em `PENDING`. Em `PAID` só `notes`; o resto se edita no lançamento |
| `POST /bills/:id/pay` | Corpo `{ accountId, amount?, date?, categoryId? }` — seção 6 |
| `POST /bills/:id/unpay` | Desfaz o pagamento — seção 6.3 (exclui o lançamento só se `GENERATED`) |
| `PATCH /bills/:id/cancel` | `PENDING` → `CANCELED` |
| `PATCH /bills/:id/reopen` | `CANCELED` → `PENDING` |
| `DELETE /bills/:id` | Só conta **avulsa** e `PENDING`. Conta gerada por recorrência é **cancelada**, não apagada: se a última conta gerada fosse apagada, o cursor do job voltaria uma data e ele a recriaria |

O documento `36` acrescenta `GET /bills/:id/match-candidates` e
`POST /bills/:id/link-transaction` (pagar uma conta vinculando a um
lançamento que já existe), além das ações novas na confirmação da
importação.

`householdId` sempre vem do `HouseholdGuard`, nunca do corpo (regra
transversal desde o MVP).

## 10. Auditoria, eventos e notificações

- **Auditoria:** adicionar `Bill` a `AUDITED_MODELS` (`14`, seção 4) e um
  mapeamento no `auditMessageFormatter` ("Conta paga por Ana — Condomínio,
  R$ 600,00"). Pagar gera duas entradas encadeadas no tempo (`Transaction`
  `CREATE` e `Bill` `UPDATE`), o que é correto: são duas mudanças.
- **Eventos novos:** nenhum nesta versão. Orçamento e metas reagem pelo
  fluxo de criação de transação já existente.
- **Lembretes (evolução natural, fora desta versão):** tipos
  `BILL_DUE_SOON` e `BILL_OVERDUE` em `10-notificacoes.md`, emitidos por um
  job diário (horário de Brasília), só in-app, com **uma notificação por
  conta por tipo** (deduplicada por `metadata.billId` + tipo) para não
  repetir todo dia. O fan-out precisa **respeitar a permissão por conta**:
  só avisa quem enxerga a conta.

## 11. Frontend

### 11.1 — Tela `/bills` ("Contas a pagar")

- Seletor de mês (o mesmo do painel). No mês corrente, as atrasadas de
  meses anteriores aparecem no topo — conta não paga **não some** quando o
  mês vira.
- Cabeçalho: `ProgressBar` (tom `brand`, como parcelamento) com
  `7 de 12 pagas · R$ 1.840,00 restantes`.
- Seções: **Atrasadas** → **A pagar** (por vencimento) → **Pagas** (mais
  discretas, no fim).
- Cada linha: checkbox grande (área de toque ≥ 44px, `min-h-11`),
  descrição, `CategoryChip`, vencimento ("vence 10/10" / "venceu há 3
  dias"), valor com `tabular-nums` e `StatusBadge` da seção 5. Abaixo de
  `md`, ações empilham abaixo da linha.
- **Marcar a caixa abre o diálogo "Confirmar pagamento"**, já preenchido
  (valor, data, conta, categoria) e com o foco no **valor** — contas de
  valor variável (luz, água) exigem ver o número antes de gravar. Um botão
  primário, "Marcar como paga". Folha de tela cheia abaixo de `md`,
  diálogo centralizado a partir de `md`. O `36` acrescenta a esse diálogo a
  oferta de vincular a um lançamento que já existe.
- Desmarcar uma conta paga pede confirmação com o efeito explícito.
  `GENERATED`: "O lançamento *X* será excluído e o saldo de *Conta Y* volta
  a *R$ Z*". `LINKED`: "O lançamento *X* será mantido; só esta conta volta
  a pendente".
- Menu "⋯" por linha: editar, cancelar/reabrir, excluir (só avulsa).

### 11.2 — Formulário "Nova conta a pagar"

Descrição, valor previsto, vencimento, "Paga com" (opcional), categoria.
Dois alternadores, no mesmo padrão do "É parcelado?" (`11`, seção 8.1):

- **"É fatura de cartão?"** — troca categoria por seleção de conta de
  cartão (`targetAccountId`) e mostra a dica "o pagamento vira
  transferência, não despesa".
- **"Repete todo mês?"** — o submit chama `POST /recurring-transactions`
  com `mode: 'BILL'` em vez de `POST /bills`.

### 11.3 — Outras telas

- **`/recurring`:** novo campo "Como lançar?" — *Lançar sozinho na data* /
  *Criar conta a pagar para eu confirmar* — com uma frase de ajuda em cada
  opção (a escolha errada é o risco 2 da seção 13).
- **Painel:** card "Contas a pagar" (`N pendentes · R$ X`, `M atrasadas`
  com `StatusBadge` `expense`), linkando para `/bills`.
- **`/transactions`:** lançamento vindo de conta ganha `StatusBadge`
  `neutral` "Conta paga"; excluí-lo avisa que a conta volta a pendente.
- **Navegação:** grupo *Compromissos* da sidebar (Parcelas, Recorrentes,
  **Contas a pagar**); no mobile, dentro de "Mais" — o atalho de uso diário
  é o card do painel.
- **Onboarding:** não entra como passo (`20`, seção 9 já alerta que a
  lista de aprofundamento só cresce).

## 12. Fases de Execução

### Fase 1 — Modelagem e pagamento atômico

- [ ] Migration: `Bill`, `BillStatus`, `BillSettlement`, `RecurrenceMode`,
      e os campos novos em `RecurringTransaction` e a relação inversa em
      `Transaction`.
- [ ] Schemas Zod em `packages/types` (`createBillSchema`, `payBillSchema`;
      regras de `mode`/`targetAccountId` no schema de recorrência).
- [ ] Refatorar `transactions` para `createWithin(trx)` / `deleteWithin(trx)`
      devolvendo eventos pendentes; travar mudança de `type` em
      lançamento vinculado a conta; reabrir a conta ao excluir o
      lançamento.
- [ ] `payBill()` e `unpayBill()`, com testes cobrindo: pagar `EXPENSE`
      debita o saldo; pagar fatura cria `TRANSFER` (banco diminui, cartão
      aumenta, nenhuma despesa nova); **dois pagamentos concorrentes geram
      um único lançamento**; desfazer (`GENERATED`) reverte o saldo e
      reabre; excluir o lançamento reabre a conta; rollback não emite
      evento de orçamento.

### Fase 2 — API e permissão

- [ ] `POST/GET/PATCH/DELETE /bills`, `cancel`, `reopen`, `summary`.
- [ ] Estado derivado (seção 5) com "hoje" em `America/Sao_Paulo` — teste
      às 22h BRT confirmando que "vence hoje" não vira "atrasada".
- [ ] Filtro de visibilidade da seção 8 em **todos** os pontos de leitura;
      incluir `Bill` no teste de regressão de `25` (seção 7).
- [ ] `Bill` em `AUDITED_MODELS` + formatter.

### Fase 3 — Recorrência em modo `BILL`

- [ ] `mode` e `targetAccountId` nos endpoints de `/recurring-transactions`.
- [ ] Ramo `generateBillsWithinHorizon()` com laço e tratamento de
      conflito de unicidade como caso esperado.
- [ ] Testes: janela de 30 dias, recuperação de atraso (API parada por
      dias), idempotência (rodar o job duas vezes), pausa, `DELETE` só
      cancelando as futuras, e que o ramo `AUTO_POST` segue idêntico.

### Fase 4 — Frontend

- [ ] `/bills` com checklist, diálogo de pagamento e desfazer.
- [ ] Formulário com os alternadores; campo "Como lançar?" em `/recurring`.
- [ ] Card no painel, badge em `/transactions`, item de navegação.
- [ ] Invalidar `['bills']`, `['transactions']`, `['accounts']` e
      `['dashboard']` ao pagar/desfazer (o saldo muda).

### Fase 5 — Conciliação com a importação

- [ ] Implementar
      [`36`](./36-importacao-conciliacao-contas-a-pagar.md) (seção 13,
      risco 1). Mesmo Release PR desta feature. O ramo `LINKED` do
      `unpay` só é exercitável com o `36`; seus testes moram lá.

## 13. Riscos e pontos de atenção

1. **Duplicidade com importação de extrato (o risco mais provável).** A
   pessoa marca "Condomínio" como pago (nasce um lançamento) e, dias
   depois, importa o extrato (`07`/`08`) que traz o mesmo débito. A
   deduplicação de `07` é só por `externalId`, e um lançamento manual não
   tem `externalId` — o duplicado passa. Importar primeiro e pagar depois
   duplica do mesmo jeito. Resolvido por
   [`36`](./36-importacao-conciliacao-contas-a-pagar.md): o preview
   concilia as linhas com lançamentos e contas pendentes, e o diálogo de
   pagamento oferece vincular a um lançamento existente. **Não liberar
   Contas a Pagar para uso real sem o `36`.**

2. **Mesma conta cadastrada nos dois modos de recorrência.** Aluguel como
   `AUTO_POST` *e* como `BILL` gera despesa em dobro. A frase de ajuda em
   `/recurring` ajuda; avaliar um aviso suave ao criar um template cuja
   descrição, valor e conta coincidam com um template ativo do outro modo.

3. **Fatura de cartão cadastrada como despesa comum dobra o gasto.** Por
   isso o alternador "É fatura de cartão?" fica visível no formulário, com
   a dica. Não há como impedir quem ignora o alternador.

4. **Valor variável é estimativa.** `amount` é obrigatório (sem "valor
   desconhecido") para manter somas e ordenação simples; luz e água usam
   uma média e são ajustadas ao pagar. Por isso o checkbox abre o diálogo
   com foco no valor, em vez de pagar com um toque. Se os dois toques
   incomodarem no uso real, a evolução é um campo "valor fixo" por conta
   (um toque + "Desfazer") — não vale o campo extra antes de saber.

5. **Fuso e `@db.Date`.** `dueDate` é data pura e trafega como
   `YYYY-MM-DD`. Serializar como `DateTime` UTC é o bug clássico de "vence
   dia 10 e aparece dia 9". O teste das 22h BRT (Fase 2) existe por isso.

6. **Editar o template com contas já geradas.** Com horizonte de 30 dias, o
   mês seguinte quase sempre já existe quando a pessoa reajusta o aluguel;
   a edição prospectiva só vale a partir da conta ainda não gerada. Decisão
   de produto em aberto: oferecer, no `PATCH` do template, "aplicar também
   às contas pendentes já geradas" (só `PENDING` com vencimento ≥ hoje).

7. **Retrofitting do filtro de permissão** (seção 8) é a parte de maior
   risco técnico, pelo mesmo motivo de `25`: um endpoint esquecido vaza o
   valor e a descrição de uma conta ligada a uma conta restrita.

8. **Eventos só depois do commit** (seção 6.1) exigem que `createWithin` e
   `deleteWithin` nunca emitam por conta própria. Vale um teste que falhe
   se alguém reintroduzir `emit` dentro da transação.

9. **Entra no critério de 1.0.** É o item 15 do roadmap; a 1.0 passa a
   exigir 15 itens, não 14. A posição de execução (logo após o
   Onboarding) não muda isso.

## 14. Fora de escopo

Registrado para não ser confundido com esquecimento:

- Leitura de código de barras / linha digitável de boleto.
- Anexar comprovante de pagamento.
- **Pagamento parcial** — paga-se o valor real e, se sobrar saldo
  devedor, cria-se outra conta.
- **Contas a receber** (o espelho da feature, para `INCOME`).
- Ciclo de fechamento/vencimento de cartão (`11`, seção 4).
- Lembretes e notificações (seção 10) e preferências por usuário.
- Contas a pagar no relatório exportável (`23`) e nos insights (`38`).

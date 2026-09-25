# Parcelamento de Compras

> Depende do módulo `transactions` já existente — cada parcela **é** uma
> `Transaction` normal (mesmo tipo `EXPENSE`, mesma lógica de saldo), só
> que agrupada sob um plano e, em parte, com o impacto no saldo adiado
> para o mês em que a parcela efetivamente vence.

## 1. Objetivo

Permitir registrar uma compra parcelada (tipicamente no cartão de
crédito, mas não exclusivamente) como um único lançamento de entrada, e o
sistema gerar automaticamente as N parcelas futuras — cada uma impactando
o saldo da conta apenas no mês correspondente, não tudo de uma vez.

## 2. O problema central: saldo "de hoje" vs. compromisso futuro

O modelo atual de `Transaction` assume que o impacto no saldo acontece no
momento da criação, independente da data do lançamento — o que faz sentido
para um lançamento manual ou importado (a data é, na prática, "agora" ou
"muito recente"). Parcelamento quebra essa suposição: uma compra em 10x
hoje não deveria debitar o valor total da conta hoje — deveria debitar
1/10 hoje e o restante nos 9 meses seguintes, conforme cada parcela vence.

Isso exige um conceito novo que a `Transaction` ainda não tem:
**diferenciar uma parcela já efetivada de uma parcela agendada para o
futuro.**

## 3. Modelagem de Dados

### 3.1 — Novo model: `InstallmentPlan`

```prisma
model InstallmentPlan {
  id                String   @id @default(uuid())
  description       String
  totalAmount       Decimal  @db.Decimal(12, 2)
  installmentsCount Int
  purchaseDate      DateTime
  createdAt         DateTime @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  accountId String
  account   Account @relation(fields: [accountId], references: [id])

  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id])

  installments Transaction[]

  @@index([userId])
  @@map("installment_plans")
}
```

### 3.2 — Alterações em `Transaction`

```prisma
enum PostingStatus {
  SCHEDULED // data futura — ainda não impactou o saldo da conta
  POSTED    // já impactou o saldo (comportamento padrão de sempre)
}

// Campos adicionados ao model Transaction existente:
//   postingStatus     PostingStatus @default(POSTED)
//   installmentPlanId String?
//   installmentPlan   InstallmentPlan? @relation(fields: [installmentPlanId], references: [id], onDelete: SetNull)
//   installmentNumber Int?              // 1..N, só preenchido quando pertence a um plano
```

Transações comuns (manuais, importadas) continuam com `postingStatus`
sempre `POSTED` por padrão — nada muda no comportamento delas. Só as
parcelas futuras de um `InstallmentPlan` nascem como `SCHEDULED`.

## 4. Geração das parcelas

Todas as N parcelas são criadas **de uma vez**, no momento em que o plano
é cadastrado — não geradas mês a mês por um job. Isso permite ao usuário
ver, editar ou cancelar parcelas futuras individualmente antes que elas
vençam, e permite que o dashboard mostre o compromisso financeiro dos
próximos meses sem precisar calcular uma projeção separada — a parcela
futura já existe como registro, só ainda não afetou o saldo.

```ts
function generateInstallments(plan: {
  totalAmount: Prisma.Decimal;
  installmentsCount: number;
  purchaseDate: Date;
}) {
  const baseAmount = plan.totalAmount
    .dividedBy(plan.installmentsCount)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);

  const remainder = plan.totalAmount.minus(baseAmount.times(plan.installmentsCount));

  return Array.from({ length: plan.installmentsCount }, (_, i) => {
    const isLast = i === plan.installmentsCount - 1;
    return {
      installmentNumber: i + 1,
      amount: isLast ? baseAmount.plus(remainder) : baseAmount,
      date: addMonths(plan.purchaseDate, i),
    };
  });
}
```

**Sobre o arredondamento:** dividir R$ 100,00 em 3x resulta em
R$ 33,33 × 3 = R$ 99,99 — sobra 1 centavo. A convenção adotada é a última
parcela absorver a diferença (R$ 33,33, R$ 33,33, R$ 33,34), para que a
soma das parcelas seja sempre exatamente igual ao valor total da compra.

**Simplificação assumida — sem modelar o ciclo de fatura do cartão:** o
vencimento de cada parcela é calculado como `purchaseDate + N meses`,
sem considerar dia de fechamento/vencimento real da fatura do cartão
(uma compra feita 2 dias antes do fechamento cai na fatura do mês
seguinte, na prática). Modelar isso corretamente exigiria cadastrar dia de
fechamento por conta de cartão — deixado fora desta primeira versão,
registrado como simplificação conhecida na seção de riscos.

## 5. Quando cada parcela impacta o saldo

Na criação do plano:

- A primeira parcela, se a `purchaseDate` for hoje ou no passado, é criada
  já como `POSTED` — o saldo da conta é debitado imediatamente, dentro do
  mesmo `prisma.$transaction` que já é usado para qualquer `EXPENSE`.
- As parcelas seguintes nascem como `SCHEDULED` — existem como registro,
  aparecem em consultas e no compromisso futuro do dashboard, mas **não**
  alteram `Account.balance` ainda.

### 5.1 — Job de "postagem" de parcelas vencidas

Um job agendado, executado diariamente, promove parcelas de `SCHEDULED`
para `POSTED` conforme a data chega:

```ts
@Cron(CronExpression.EVERY_DAY_AT_1AM)
async function postDueInstallments() {
  const due = await prisma.transaction.findMany({
    where: { postingStatus: 'SCHEDULED', date: { lte: new Date() } },
  });

  for (const tx of due) {
    await prisma.$transaction(async (trx) => {
      // idempotência: revalida o status dentro da transação antes de aplicar,
      // caso o job seja executado mais de uma vez por algum motivo
      const current = await trx.transaction.findUnique({ where: { id: tx.id } });
      if (current?.postingStatus !== 'SCHEDULED') return;

      await trx.account.update({
        where: { id: tx.accountId! },
        data: { balance: { decrement: tx.amount } },
      });
      await trx.transaction.update({
        where: { id: tx.id },
        data: { postingStatus: 'POSTED' },
      });
    });
  }
}
```

**Por que um cron interno (`@nestjs/schedule`) e não o n8n:** diferente da
importação por email e do envio de notificação — que são integrações com
serviços externos (caixa de email, SMTP) — esta é uma rotina de domínio
que precisa rodar dentro da mesma garantia transacional do Postgres que já
protege a consistência de saldo em todo o resto do sistema. Colocar essa
lógica em uma ferramenta externa introduziria uma segunda fonte de verdade
sobre quando o saldo muda, sem necessidade real.

## 6. Interação com Orçamentos (feature já existente)

O cálculo de `getBudgetProgress()` (definido em
[`09-orcamentos.md`](./09-orcamentos.md)) já soma transações `EXPENSE`
filtrando apenas por `categoryId` e intervalo de `date` — **sem filtrar por
`postingStatus`**. Isso significa que, sem nenhuma alteração naquela
lógica, uma parcela `SCHEDULED` com vencimento em março já conta no
orçamento de março assim que o mês é consultado, mesmo antes do job de
postagem rodar. É o comportamento correto: orçamento mede **compromisso
por data**, saldo mede **dinheiro já debitado** — são conceitos diferentes
por natureza, e o desenho de cada um já reflete isso sem precisar de
ajuste cruzado.

## 7. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /installment-plans` | Cria o plano e gera as N parcelas (primeira `POSTED` se vencida, demais `SCHEDULED`) |
| `GET /installment-plans` | Lista planos do usuário, com progresso (parcelas pagas/total) e valor restante comprometido |
| `GET /installment-plans/:id` | Detalhe do plano com todas as parcelas |
| `DELETE /installment-plans/:id` | Cancela as parcelas ainda `SCHEDULED` (remove o registro e não afeta saldo, já que nunca chegaram a impactá-lo); parcelas já `POSTED` **não** são revertidas automaticamente — se o usuário quiser desfazer uma parcela já paga, isso é feito como exclusão individual da `Transaction`, pelo endpoint de transações já existente, com a mesma lógica de reversão de saldo que já existe lá |

Nenhum endpoint novo de listagem para parcelas individuais — elas
aparecem naturalmente em `GET /transactions` (já existente), já que cada
parcela é uma `Transaction` como outra qualquer, só com `installmentPlanId`
e `installmentNumber` preenchidos.

## 8. Frontend

### 8.1 — Formulário de lançamento

No formulário de nova transação já existente, ao selecionar `EXPENSE`,
adicionar um alternador "É parcelado?". Quando ativo, o formulário muda
para: valor total, número de parcelas, categoria, conta, data da compra —
chamando `POST /installment-plans` em vez de `POST /transactions`.

### 8.2 — Tela `/installments`

- Lista dos planos ativos, cada um com:
  - Descrição, valor total, conta.
  - Barra de progresso (parcelas pagas / total) — reaproveitando o mesmo
    componente visual da barra de orçamento, cores do design system.
  - Texto `3/10 pagas · R$ 700,00 restantes`.
- Ação de cancelar parcelas futuras de um plano.

### 8.3 — Dashboard

- Novo card "Compromissos futuros": soma das parcelas `SCHEDULED` com
  vencimento nos próximos meses, para o usuário ver o quanto já está
  comprometido além do saldo atual — sem precisar abrir a tela de planos.

## 9. Fases de Execução

### Fase 1 — Modelagem

- [x] Migration com `InstallmentPlan`, `PostingStatus` e os novos campos
      de `Transaction`.
- [x] Função `generateInstallments()` com testes cobrindo arredondamento
      (valores que não dividem exatamente) e geração de datas.

### Fase 2 — API

- [x] `POST /installment-plans`, criando o plano e as N parcelas dentro de
      `prisma.$transaction`, aplicando saldo apenas na primeira parcela
      (se vencida).
- [x] `GET /installment-plans` e `GET /installment-plans/:id`, com cálculo
      de progresso.
- [x] `DELETE /installment-plans/:id`, removendo apenas parcelas
      `SCHEDULED`.
- [x] Job `postDueInstallments()` com `@nestjs/schedule`, incluindo a
      revalidação de status dentro da transação para idempotência.

### Fase 3 — Frontend

- [x] Alternador "É parcelado?" no formulário de nova transação.
- [x] Tela `/installments` com progresso por plano.
- [x] Card "Compromissos futuros" no dashboard.

## 10. Riscos e pontos de atenção

- **Ciclo de fatura do cartão não é modelado** (seção 4) — o vencimento é
  uma aproximação por mês corrido a partir da data da compra, não o
  fechamento real da fatura. Para uso doméstico isso costuma ser
  suficiente, mas é uma simplificação deliberada, não um detalhe
  esquecido.
- **Pagamento da fatura do cartão em si não é modelado nesta feature.**
  O saldo da conta `CREDIT_CARD` continua representando "quanto está
  gasto/devido", mas o ato de pagar a fatura (uma transferência da conta
  corrente para zerar ou reduzir esse saldo) fica fora de escopo — é uma
  feature relacionada, não coberta aqui, que deveria ser avaliada depois
  como uma extensão do módulo de transferências já existente.
- **Idempotência do job de postagem é essencial.** Se o cron rodar duas
  vezes para a mesma parcela (reinício do processo, execução sobreposta),
  sem a revalidação de status dentro da transação (seção 5.1) o saldo
  seria debitado em dobro. Isso precisa ser coberto por teste automatizado
  antes de considerar a Fase 2 concluída, não só revisado manualmente.
- **Cancelamento parcial de plano** (parcelas já `POSTED` continuam
  existindo como transações normais após o `DELETE /installment-plans/:id`)
  é uma decisão consciente de manter histórico intacto — vale deixar
  explícito na interface que "cancelar" afeta só o que ainda não venceu,
  para não gerar expectativa de que parcelas já pagas somem do extrato.

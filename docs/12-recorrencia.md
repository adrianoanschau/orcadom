# Transações Recorrentes

> Depende do mecanismo `postingStatus` (`SCHEDULED`/`POSTED`) introduzido
> na feature de [Parcelamento de Compras](./11-parcelamento.md) — em vez
> de criar um sistema de agendamento paralelo, esta feature reaproveita a
> mesma infraestrutura, só trocando **quem gera** a próxima parcela
> agendada.

## 1. Objetivo

Permitir cadastrar um lançamento que se repete (aluguel, assinatura de
streaming, salário) uma única vez, e o sistema gerar automaticamente cada
ocorrência futura como uma transação de verdade — sem o usuário precisar
digitar o mesmo lançamento todo mês.

## 2. Em que difere do Parcelamento

Na superfície, parece o mesmo problema (algo que se repete ao longo do
tempo), mas a diferença estrutural importa para o desenho:

| | Parcelamento | Recorrência |
|---|---|---|
| Quantidade de ocorrências | Fixa e conhecida (`installmentsCount`) | Indefinida (continua até ser cancelada, ou até uma data-fim opcional) |
| Valor | Fixo, definido na criação, dividido entre as parcelas | Pode variar entre ocorrências (edição não é retroativa nem versionada — seção 5) |
| Tipo de transação | Sempre `EXPENSE` | `INCOME` ou `EXPENSE` (salário é recorrência de receita) |
| Geração das ocorrências | Todas de uma vez, no cadastro | Uma de cada vez, por um job, conforme o tempo passa — não é possível gerar "todas" porque não há fim definido |

Por causa dessa última diferença, o **mecanismo de geração** muda: em vez
de criar N transações de uma vez, um job gera a próxima ocorrência dentro
de uma janela rolante (os próximos dias), e assim sucessivamente, sem fim.

## 3. Reaproveitamento do mecanismo `postingStatus`

A feature de parcelamento já resolveu o problema de "uma transação datada
no futuro que ainda não deve afetar o saldo": o campo `postingStatus`
(`SCHEDULED` → `POSTED`) e o job diário que promove uma parcela quando a
data chega. Recorrência usa exatamente o mesmo campo e o mesmo job — a
única coisa nova é **o que gera** a transação `SCHEDULED` em primeiro
lugar.

```
Parcelamento:  todas as N parcelas nascem de uma vez, no cadastro do plano
Recorrência:   uma ocorrência de cada vez nasce, dentro de uma janela
               rolante de alguns dias, gerada por um job próprio
                        │
                        ▼
        (a partir daqui, o fluxo é idêntico ao do parcelamento)
        job diário promove SCHEDULED → POSTED quando a data chega,
        debitando/creditando o saldo dentro de prisma.$transaction
```

O job de postagem (`postDueInstallments`, da feature anterior) não precisa
saber se a transação `SCHEDULED` que está promovendo veio de um plano de
parcelamento ou de uma recorrência — ele já opera em cima de `Transaction`
genericamente. Vale renomeá-lo para refletir isso:
`postDueScheduledTransactions()`.

## 4. Modelagem de Dados

```prisma
enum RecurrenceFrequency {
  WEEKLY
  MONTHLY
  YEARLY
}

model RecurringTransaction {
  id          String              @id @default(uuid())
  description String
  amount      Decimal             @db.Decimal(12, 2)
  type        TransactionType     // reaproveita o enum já existente — INCOME ou EXPENSE
  frequency   RecurrenceFrequency
  dayOfMonth  Int?                // usado quando frequency = MONTHLY (1–31, com ajuste de fim de mês — seção 6)
  startDate   DateTime
  endDate     DateTime?           // null = indefinida
  active      Boolean             @default(true)
  createdAt   DateTime            @default(now())

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  accountId String
  account   Account @relation(fields: [accountId], references: [id])

  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id])

  occurrences Transaction[]

  @@index([userId, active])
  @@map("recurring_transactions")
}

// Campo adicionado ao model Transaction existente:
//   recurringTransactionId String?
//   recurringTransaction   RecurringTransaction? @relation(fields: [recurringTransactionId], references: [id], onDelete: SetNull)
//
//   @@unique([recurringTransactionId, date])  // impede gerar duas ocorrências para a mesma data
```

A restrição `@@unique([recurringTransactionId, date])` funciona como
proteção contra geração duplicada mesmo sob execução concorrente do job —
o Postgres rejeita a segunda tentativa de criar uma ocorrência para a
mesma data, e o job trata esse erro como "já existe, seguir adiante" em
vez de falhar.

## 5. Por que a edição não é versionada (diferente de Orçamento)

A feature de Orçamentos precisou de versionamento por vigência (seção 3 de
[`09-orcamentos.md`](./09-orcamentos.md)) porque o **cálculo de progresso
de um mês passado** dependia do valor do limite que estava vigente
naquele mês. Recorrência não tem esse problema: cada ocorrência gerada já
é uma `Transaction` independente, com o valor gravado no momento da
geração. Editar o `RecurringTransaction` (ex: aumentar o valor do aluguel)
só afeta ocorrências geradas **depois** da edição — as já existentes,
`SCHEDULED` ou `POSTED`, mantêm o valor com que nasceram. Não é necessário
histórico de versões porque o histórico já está implicitamente preservado
nas próprias transações geradas.

## 6. Geração das ocorrências

Job diário, executado antes do job de postagem:

```ts
@Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
async function generateDueRecurringOccurrences() {
  const horizon = addDays(new Date(), 3); // janela rolante de antecedência

  const active = await prisma.recurringTransaction.findMany({
    where: {
      active: true,
      startDate: { lte: horizon },
      OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
    },
  });

  for (const recurring of active) {
    const nextDate = calculateNextOccurrenceDate(recurring); // ver nota abaixo
    if (nextDate > horizon) continue;

    try {
      await prisma.transaction.create({
        data: {
          userId: recurring.userId,
          accountId: recurring.accountId,
          categoryId: recurring.categoryId,
          description: recurring.description,
          amount: recurring.amount,
          type: recurring.type,
          date: nextDate,
          recurringTransactionId: recurring.id,
          postingStatus: isPast(nextDate) || isToday(nextDate) ? 'POSTED' : 'SCHEDULED',
        },
      });
      // se postingStatus for POSTED, o saldo já é aplicado dentro da
      // mesma lógica de criação de transação usada em todo o resto do sistema
    } catch (err) {
      if (isUniqueConstraintViolation(err)) continue; // já gerada, sem problema
      throw err;
    }
  }
}
```

**Cálculo da próxima data (`calculateNextOccurrenceDate`)** parte da
última ocorrência já gerada para aquele `RecurringTransaction` (ou de
`startDate`, se ainda não houver nenhuma) e soma o intervalo de
`frequency`. Para `MONTHLY` com `dayOfMonth` maior que o número de dias do
mês de destino (ex: dia 31 recorrendo em fevereiro), a convenção adotada é
usar o **último dia do mês** naquele caso — evita datas inválidas sem
exigir configuração extra do usuário.

## 7. Endpoints

| Endpoint | O que faz |
|---|---|
| `POST /recurring-transactions` | Cria a definição. Se `startDate` já venceu ou é hoje, a primeira ocorrência é gerada imediatamente (mesma lógica do job) |
| `GET /recurring-transactions` | Lista definições do usuário, ativas e inativas |
| `PATCH /recurring-transactions/:id` | Edita a definição — afeta apenas ocorrências geradas a partir daqui (seção 5) |
| `PATCH /recurring-transactions/:id/pause` | `active = false` — para a geração de novas ocorrências |
| `PATCH /recurring-transactions/:id/resume` | `active = true` |
| `DELETE /recurring-transactions/:id` | Desativa e remove ocorrências ainda `SCHEDULED` (mesmo comportamento já adotado no cancelamento de plano de parcelamento — ocorrências `POSTED` não são revertidas automaticamente) |

Como no parcelamento, não existe endpoint separado para listar
ocorrências — elas aparecem em `GET /transactions`, já que cada uma é uma
`Transaction` comum com `recurringTransactionId` preenchido.

## 8. Frontend

### 8.1 — Tela `/recurring`

- Lista de recorrências ativas: descrição, valor, frequência, conta,
  próxima ocorrência prevista.
- Formulário de criação: descrição, valor, tipo (receita/despesa),
  categoria, conta, frequência, dia do mês (quando mensal), data de
  início, data de fim (opcional).
- Ação de pausar/retomar e de excluir.

### 8.2 — Dashboard

O card **"Compromissos futuros"**, criado na feature de parcelamento para
mostrar parcelas `SCHEDULED`, passa a ser genérico — mostra qualquer
`Transaction` com `postingStatus = SCHEDULED`, independente de ter vindo
de um plano de parcelamento ou de uma recorrência. Nenhuma mudança de
código no card em si, já que ele já consulta por `postingStatus`, não pela
origem.

## 9. Fases de Execução

### Fase 1 — Modelagem

- [x] Migration com `RecurringTransaction`, `RecurrenceFrequency` e o novo
      campo `recurringTransactionId` em `Transaction`, incluindo o índice
      único `[recurringTransactionId, date]`.
- [x] Função `calculateNextOccurrenceDate()` com testes cobrindo os três
      tipos de frequência e o caso de ajuste de fim de mês.

### Fase 2 — API

- [x] `POST /recurring-transactions`, com geração imediata da primeira
      ocorrência quando aplicável.
- [x] `GET`, `PATCH`, `pause`/`resume`, `DELETE`.
- [x] Job `generateDueRecurringOccurrences()`, com tratamento de conflito
      de unicidade como caso esperado, não erro.
- [x] Renomear (ou generalizar) o job de postagem existente para
      `postDueScheduledTransactions()`, confirmando que ele já cobre
      ocorrências de recorrência sem nenhuma alteração de lógica.

### Fase 3 — Frontend

- [x] Tela `/recurring` com listagem e formulário.
- [x] Confirmar que o card "Compromissos futuros" do dashboard já reflete
      ocorrências recorrentes sem alteração adicional.

## 10. Riscos e pontos de atenção

- **Janela de antecedência fixa (3 dias) é uma simplificação deliberada.**
  O usuário não vê recorrências "muito no futuro" no card de compromissos
  — só o que está prestes a vencer. Aumentar a janela é trivial (é uma
  constante), mas aumentar demais gera muitas transações `SCHEDULED`
  represadas se o usuário não abrir o app por um tempo; vale rever esse
  número depois de observar uso real.
- **Execução do job depende do processo da API estar de pé.** Se o
  servidor ficar fora do ar por vários dias, ocorrências que deveriam ter
  sido geradas nesse intervalo só aparecem quando o job rodar de novo — o
  `calculateNextOccurrenceDate()` precisa ser escrito de forma que
  recupere corretamente ocorrências atrasadas (gerar todas as que
  ficaram para trás, não só a próxima), não assumir que o job roda
  exatamente uma vez por dia sem falhas.
- **Edição de valor no meio da recorrência pode confundir o usuário** se
  ele não entender que é prospectiva, não retroativa (seção 5) — vale um
  aviso claro na UI ao editar ("a partir da próxima ocorrência").
- **Ajuste de dia de fim de mês (seção 6) é uma convenção, não uma
  configuração** — se o usuário esperava um comportamento diferente (ex:
  pular fevereiro em vez de cair no último dia), isso não é ajustável nesta
  versão. Registrado como possível ponto de confusão, não como bug.

# Modelagem de Dados

## Entidades do MVP

- **User** — dono dos dados. Todo o resto do modelo é isolado por `userId`.
- **Account** — carteira, conta corrente ou cartão de crédito. Possui um
  saldo (`balance`) desnormalizado, atualizado a cada transação.
- **Category** — categoria de receita ou despesa, definida pelo próprio
  usuário.
- **Transaction** — lançamento de receita, despesa ou transferência entre
  contas.

## Diagrama de relacionamento (simplificado)

```
User (1) ── (N) Account
User (1) ── (N) Category
User (1) ── (N) Transaction

Account (1) ── (N) Transaction          [INCOME / EXPENSE]
Account (1) ── (N) Transaction.from     [TRANSFER — origem]
Account (1) ── (N) Transaction.to       [TRANSFER — destino]
Category (1) ── (N) Transaction
```

## Decisões de modelagem

### Por que `Transaction` tem 4 relações de conta em vez de 1

Uma transferência entre contas não é "uma transação com uma conta" — é uma
transação com uma conta de **origem** e uma de **destino**. Modelar isso
com um único campo `accountId` obrigaria a criar duas linhas na tabela para
cada transferência (uma de saída, uma de entrada), o que complica
consultas e reconciliação. Por isso o schema usa:

- `accountId` — usado quando `type` é `INCOME` ou `EXPENSE`.
- `fromAccountId` / `toAccountId` — usados quando `type` é `TRANSFER`.

Essa validação (qual campo é obrigatório para qual `type`) **não é feita
pelo banco**, e sim pela camada de aplicação (DTO com Zod + regra de
serviço no NestJS), já que Prisma/Postgres não suportam constraints
condicionais nativas de forma simples nesse cenário.

### Por que `balance` é desnormalizado

O saldo de cada conta poderia ser sempre calculado somando as transações em
tempo de consulta. Isso foi descartado para o MVP porque:

- O dashboard e a listagem de contas precisam exibir saldo com frequência —
  recalcular por agregação a cada request tem custo.
- Ter o saldo como campo permite validações simples (ex: alertar saldo
  negativo) sem uma query agregada.

**Trade-off aceito:** toda vez que uma transação é criada, editada ou
removida, o `balance` da(s) conta(s) envolvida(s) precisa ser atualizado
**na mesma transação de banco** (`prisma.$transaction`) que grava a
transação. Se isso não for respeitado consistentemente, o saldo diverge do
extrato — é o ponto mais delicado do MVP e está destacado no roadmap
(Fase 2).

### Por que `Decimal` e não `Float` para valores monetários

`Float` usa ponto flutuante binário e introduz erros de arredondamento
(ex: `0.1 + 0.2 !== 0.3`). Em um sistema financeiro isso é inaceitável —
mesmo em centavos, erros se acumulam. `Decimal` (mapeado para
`NUMERIC(12,2)` no Postgres) representa o valor exatamente.

## Schema Prisma completo

```prisma
// packages/database/prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AccountType {
  WALLET
  CHECKING
  CREDIT_CARD
}

enum CategoryType {
  INCOME
  EXPENSE
}

enum TransactionType {
  INCOME
  EXPENSE
  TRANSFER
}

model User {
  id           String   @id @default(uuid())
  name         String
  email        String   @unique
  passwordHash String
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  accounts     Account[]
  categories   Category[]
  transactions Transaction[]

  @@map("users")
}

model Account {
  id        String      @id @default(uuid())
  name      String
  type      AccountType
  balance   Decimal     @default(0) @db.Decimal(12, 2)
  color     String?
  createdAt DateTime    @default(now())
  updatedAt DateTime    @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  transactions  Transaction[] @relation("AccountTransactions")
  transfersFrom Transaction[] @relation("TransferFromAccount")
  transfersTo   Transaction[] @relation("TransferToAccount")

  @@index([userId])
  @@map("accounts")
}

model Category {
  id    String       @id @default(uuid())
  name  String
  type  CategoryType
  icon  String?
  color String?

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  transactions Transaction[]

  @@unique([userId, name, type])
  @@index([userId])
  @@map("categories")
}

model Transaction {
  id          String          @id @default(uuid())
  description String
  amount      Decimal         @db.Decimal(12, 2)
  type        TransactionType
  date        DateTime
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  userId String
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  // Usado quando type = INCOME ou EXPENSE
  accountId String?
  account   Account? @relation("AccountTransactions", fields: [accountId], references: [id])

  categoryId String?
  category   Category? @relation(fields: [categoryId], references: [id])

  // Usado apenas quando type = TRANSFER
  fromAccountId String?
  fromAccount   Account? @relation("TransferFromAccount", fields: [fromAccountId], references: [id])

  toAccountId String?
  toAccount   Account? @relation("TransferToAccount", fields: [toAccountId], references: [id])

  @@index([userId, date])
  @@index([accountId])
  @@map("transactions")
}
```

## Índices e por quê

| Índice | Motivo |
|--------|--------|
| `Account.userId` | Toda listagem de contas filtra por usuário |
| `Category.userId` | Idem, para categorias |
| `Transaction.[userId, date]` | Consulta mais comum do sistema: transações de um usuário em um intervalo de datas (dashboard mensal) |
| `Transaction.accountId` | Extrato por conta |
| `Category.[userId, name, type]` (unique) | Evita categorias duplicadas com o mesmo nome e tipo para o mesmo usuário |

## Evoluções previstas pós-MVP (não implementar agora)

- Soft delete (`deletedAt`) em vez de exclusão física, para preservar
  histórico/auditoria.
- Tabela `Budget` vinculando `Category` a um limite mensal.
- Tabela `RecurringTransaction` para lançamentos automáticos.

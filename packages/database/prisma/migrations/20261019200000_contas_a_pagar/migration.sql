CREATE TYPE "RecurrenceMode" AS ENUM ('AUTO_POST', 'BILL');
CREATE TYPE "BillStatus" AS ENUM ('PENDING', 'PAID', 'CANCELED');
CREATE TYPE "BillSettlement" AS ENUM ('GENERATED', 'LINKED');

ALTER TABLE "recurring_transactions"
  ADD COLUMN "mode" "RecurrenceMode" NOT NULL DEFAULT 'AUTO_POST',
  ADD COLUMN "targetAccountId" TEXT;

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_transactions_targetAccountId_fkey"
  FOREIGN KEY ("targetAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "import_batches" ADD COLUMN "reconciledRows" INTEGER NOT NULL DEFAULT 0;

CREATE UNIQUE INDEX "transactions_fromAccountId_externalId_key"
  ON "transactions"("fromAccountId", "externalId");

CREATE TABLE "bills" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "dueDate" DATE NOT NULL,
    "status" "BillStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "householdId" TEXT NOT NULL,
    "accountId" TEXT,
    "categoryId" TEXT,
    "targetAccountId" TEXT,
    "recurringTransactionId" TEXT,
    "transactionId" TEXT,
    "settlement" "BillSettlement",

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bills_transactionId_key" ON "bills"("transactionId");
CREATE UNIQUE INDEX "bills_recurringTransactionId_dueDate_key" ON "bills"("recurringTransactionId", "dueDate");
CREATE INDEX "bills_householdId_dueDate_idx" ON "bills"("householdId", "dueDate");
CREATE INDEX "bills_householdId_status_dueDate_idx" ON "bills"("householdId", "status", "dueDate");

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_targetAccountId_fkey"
  FOREIGN KEY ("targetAccountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_recurringTransactionId_fkey"
  FOREIGN KEY ("recurringTransactionId") REFERENCES "recurring_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "bills"
  ADD CONSTRAINT "bills_transactionId_fkey"
  FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

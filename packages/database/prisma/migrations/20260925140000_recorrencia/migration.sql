CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'YEARLY');

CREATE TABLE "recurring_transactions" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "dayOfMonth" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "recurring_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "recurring_transactions_userId_active_idx" ON "recurring_transactions"("userId", "active");

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_transactions_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON UPDATE CASCADE;

ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_transactions_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON UPDATE CASCADE;

ALTER TABLE "transactions" ADD COLUMN "recurringTransactionId" TEXT;

CREATE UNIQUE INDEX "transactions_recurringTransactionId_date_key"
  ON "transactions"("recurringTransactionId", "date");

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_recurringTransactionId_fkey"
  FOREIGN KEY ("recurringTransactionId") REFERENCES "recurring_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

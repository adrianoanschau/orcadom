-- CreateEnum
CREATE TYPE "OpenFinanceConnectionStatus" AS ENUM ('ACTIVE', 'UPDATING', 'LOGIN_ERROR', 'EXPIRED', 'REVOKED');

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN "externalProvider" TEXT;
ALTER TABLE "accounts" ADD COLUMN "externalAccountId" TEXT;

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN "externalProvider" TEXT;

-- CreateTable
CREATE TABLE "open_finance_connections" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "status" "OpenFinanceConnectionStatus" NOT NULL,
    "institutionName" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,

    CONSTRAINT "open_finance_connections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "open_finance_external_keys" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "transactionId" TEXT NOT NULL,

    CONSTRAINT "open_finance_external_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounts_householdId_externalProvider_externalAccountId_key" ON "accounts"("householdId", "externalProvider", "externalAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_externalProvider_externalId_key" ON "transactions"("externalProvider", "externalId");

-- CreateIndex
CREATE UNIQUE INDEX "open_finance_connections_provider_externalId_key" ON "open_finance_connections"("provider", "externalId");

-- CreateIndex
CREATE INDEX "open_finance_connections_userId_idx" ON "open_finance_connections"("userId");

-- CreateIndex
CREATE INDEX "open_finance_connections_householdId_idx" ON "open_finance_connections"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "open_finance_external_keys_provider_externalId_key" ON "open_finance_external_keys"("provider", "externalId");

-- CreateIndex
CREATE INDEX "open_finance_external_keys_transactionId_idx" ON "open_finance_external_keys"("transactionId");

-- AddForeignKey
ALTER TABLE "open_finance_connections" ADD CONSTRAINT "open_finance_connections_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_finance_connections" ADD CONSTRAINT "open_finance_connections_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "open_finance_external_keys" ADD CONSTRAINT "open_finance_external_keys_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

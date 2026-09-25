CREATE TYPE "PostingStatus" AS ENUM ('SCHEDULED', 'POSTED');

ALTER TABLE "transactions" ADD COLUMN "postingStatus" "PostingStatus" NOT NULL DEFAULT 'POSTED';
ALTER TABLE "transactions" ADD COLUMN "installmentNumber" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "installmentPlanId" TEXT;

CREATE TABLE "installment_plans" (
    "id" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "totalAmount" DECIMAL(12,2) NOT NULL,
    "installmentsCount" INTEGER NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "categoryId" TEXT,

    CONSTRAINT "installment_plans_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "installment_plans_userId_idx" ON "installment_plans"("userId");
CREATE INDEX "transactions_postingStatus_date_idx" ON "transactions"("postingStatus", "date");

ALTER TABLE "installment_plans"
  ADD CONSTRAINT "installment_plans_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installment_plans"
  ADD CONSTRAINT "installment_plans_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON UPDATE CASCADE;

ALTER TABLE "installment_plans"
  ADD CONSTRAINT "installment_plans_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON UPDATE CASCADE;

ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_installmentPlanId_fkey"
  FOREIGN KEY ("installmentPlanId") REFERENCES "installment_plans"("id") ON DELETE SET NULL ON UPDATE CASCADE;

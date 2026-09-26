CREATE TYPE "SavingsGoalStatus" AS ENUM ('ACTIVE', 'COMPLETED', 'ABANDONED');

ALTER TYPE "NotificationType" ADD VALUE 'SAVINGS_GOAL_COMPLETED';

CREATE TABLE "savings_goals" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetAmount" DECIMAL(12,2) NOT NULL,
    "targetDate" TIMESTAMP(3),
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "SavingsGoalStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "householdId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "savings_goals_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "savings_goals_householdId_status_idx" ON "savings_goals"("householdId", "status");

ALTER TABLE "savings_goals"
  ADD CONSTRAINT "savings_goals_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "savings_goals"
  ADD CONSTRAINT "savings_goals_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON UPDATE CASCADE;

CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');
CREATE TYPE "AuditSource" AS ENUM ('USER', 'AUTOMATION_EMAIL', 'CRON_INSTALLMENT', 'CRON_RECURRING', 'SYSTEM');

CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "AuditAction" NOT NULL,
    "source" "AuditSource" NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorUserId" TEXT,
    "householdId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "audit_logs_householdId_entityType_entityId_idx"
  ON "audit_logs"("householdId", "entityType", "entityId");
CREATE INDEX "audit_logs_householdId_createdAt_idx"
  ON "audit_logs"("householdId", "createdAt");

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

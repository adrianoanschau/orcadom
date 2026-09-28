CREATE TYPE "ReportFormat" AS ENUM ('PDF', 'XLSX');

CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'FAILED');

ALTER TYPE "NotificationType" ADD VALUE 'REPORT_READY';

CREATE TABLE "report_requests" (
    "id" TEXT NOT NULL,
    "format" "ReportFormat" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "filters" JSONB NOT NULL,
    "filePath" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "householdId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,

    CONSTRAINT "report_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "report_requests_householdId_requestedByUserId_idx" ON "report_requests"("householdId", "requestedByUserId");

CREATE INDEX "report_requests_expiresAt_idx" ON "report_requests"("expiresAt");

ALTER TABLE "report_requests"
  ADD CONSTRAINT "report_requests_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "report_requests"
  ADD CONSTRAINT "report_requests_requestedByUserId_fkey"
  FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON UPDATE CASCADE;

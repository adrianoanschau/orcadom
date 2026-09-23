-- Schema isolado para o n8n reutilizar o mesmo Postgres.
CREATE SCHEMA IF NOT EXISTS n8n;

-- CreateEnum
CREATE TYPE "ImportSource" AS ENUM ('MANUAL', 'EMAIL');

-- CreateEnum
CREATE TYPE "EmailImportStatus" AS ENUM ('PROCESSED', 'SKIPPED_DUPLICATE', 'UNRECOGNIZED_TOKEN', 'UNMAPPED_ACCOUNT', 'ERROR');

-- AlterEnum
ALTER TYPE "ImportStatus" ADD VALUE 'UNMAPPED_ACCOUNT';

-- AlterTable
ALTER TABLE "import_batches"
  ADD COLUMN "source" "ImportSource" NOT NULL DEFAULT 'MANUAL',
  ADD COLUMN "bankId" TEXT,
  ADD COLUMN "acctId" TEXT,
  ADD COLUMN "preview" JSONB,
  ALTER COLUMN "accountId" DROP NOT NULL;

ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_accountId_fkey";

ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "import_batches_userId_status_idx" ON "import_batches"("userId", "status");

-- CreateTable
CREATE TABLE "user_import_aliases" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_import_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_import_aliases_token_key" ON "user_import_aliases"("token");
CREATE UNIQUE INDEX "user_import_aliases_userId_key" ON "user_import_aliases"("userId");

ALTER TABLE "user_import_aliases"
  ADD CONSTRAINT "user_import_aliases_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "bank_account_mappings" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "acctId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,

    CONSTRAINT "bank_account_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "bank_account_mappings_userId_bankId_acctId_key" ON "bank_account_mappings"("userId", "bankId", "acctId");
CREATE INDEX "bank_account_mappings_userId_idx" ON "bank_account_mappings"("userId");

ALTER TABLE "bank_account_mappings"
  ADD CONSTRAINT "bank_account_mappings_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_account_mappings"
  ADD CONSTRAINT "bank_account_mappings_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "email_import_logs" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "attachmentHash" TEXT NOT NULL,
    "recipientAddress" TEXT NOT NULL,
    "status" "EmailImportStatus" NOT NULL,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,
    "importBatchId" TEXT,

    CONSTRAINT "email_import_logs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "email_import_logs_messageId_attachmentHash_key" ON "email_import_logs"("messageId", "attachmentHash");
CREATE INDEX "email_import_logs_status_createdAt_idx" ON "email_import_logs"("status", "createdAt");

ALTER TABLE "email_import_logs"
  ADD CONSTRAINT "email_import_logs_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "email_import_logs"
  ADD CONSTRAINT "email_import_logs_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "importBatchId" TEXT,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "import_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

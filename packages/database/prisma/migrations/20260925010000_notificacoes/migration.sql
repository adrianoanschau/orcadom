CREATE TYPE "NotificationType" AS ENUM (
  'BUDGET_WARNING',
  'BUDGET_EXCEEDED',
  'EMAIL_IMPORT_READY',
  'EMAIL_IMPORT_UNMAPPED_ACCOUNT'
);

CREATE TYPE "NotificationChannel" AS ENUM ('IN_APP', 'EMAIL');

ALTER TABLE "notifications" ADD COLUMN "message" TEXT;
ALTER TABLE "notifications" ADD COLUMN "metadata" JSONB;
ALTER TABLE "notifications" ADD COLUMN "channels" "NotificationChannel"[] NOT NULL DEFAULT ARRAY['IN_APP']::"NotificationChannel"[];

UPDATE "notifications"
SET "message" = "body";

UPDATE "notifications"
SET "metadata" = jsonb_build_object('importBatchId', "importBatchId")
WHERE "importBatchId" IS NOT NULL;

UPDATE "notifications"
SET "type" = 'EMAIL_IMPORT_UNMAPPED_ACCOUNT'
WHERE "type" = 'EMAIL_IMPORT_UNMAPPED';

ALTER TABLE "notifications" ALTER COLUMN "message" SET NOT NULL;

ALTER TABLE "notifications" ALTER COLUMN "type" DROP DEFAULT;
ALTER TABLE "notifications"
  ALTER COLUMN "type" TYPE "NotificationType"
  USING "type"::"NotificationType";

ALTER TABLE "notifications" DROP CONSTRAINT "notifications_importBatchId_fkey";
ALTER TABLE "notifications" DROP COLUMN "importBatchId";
ALTER TABLE "notifications" DROP COLUMN "body";

DROP INDEX "notifications_userId_readAt_createdAt_idx";
CREATE INDEX "notifications_userId_readAt_idx" ON "notifications"("userId", "readAt");

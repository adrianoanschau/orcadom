CREATE TYPE "DateFormatPreference" AS ENUM ('PT_BR', 'EN_US', 'SYSTEM');

ALTER TABLE "users" ADD COLUMN "dateFormatPreference" "DateFormatPreference" NOT NULL DEFAULT 'SYSTEM';

UPDATE "users"
SET "dateFormatPreference" = CASE "locale"
  WHEN 'en-US' THEN 'EN_US'::"DateFormatPreference"
  WHEN 'system' THEN 'SYSTEM'::"DateFormatPreference"
  ELSE 'PT_BR'::"DateFormatPreference"
END;

ALTER TABLE "users" DROP COLUMN "locale";

ALTER TABLE "refresh_sessions" RENAME TO "refresh_tokens";

ALTER TABLE "refresh_tokens"
  ADD COLUMN "replacedByTokenHash" TEXT,
  ADD COLUMN "userAgent" TEXT,
  ADD COLUMN "ipAddress" TEXT;

CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

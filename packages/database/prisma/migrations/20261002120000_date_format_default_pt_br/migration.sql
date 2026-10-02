-- AlterTable
ALTER TABLE "users" ALTER COLUMN "dateFormatPreference" SET DEFAULT 'PT_BR';

-- The previous default followed the device language.
UPDATE "users"
SET "dateFormatPreference" = 'PT_BR'
WHERE "dateFormatPreference" = 'SYSTEM';

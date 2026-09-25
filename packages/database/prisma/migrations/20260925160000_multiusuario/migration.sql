CREATE TYPE "HouseholdRole" AS ENUM ('OWNER', 'MEMBER');
CREATE TYPE "InviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "households" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "household_members" (
    "id" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    CONSTRAINT "household_members_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_members_userId_householdId_key" ON "household_members"("userId", "householdId");
CREATE INDEX "household_members_householdId_idx" ON "household_members"("householdId");

ALTER TABLE "household_members"
  ADD CONSTRAINT "household_members_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "household_members"
  ADD CONSTRAINT "household_members_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "household_invites" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "role" "HouseholdRole" NOT NULL DEFAULT 'MEMBER',
    "status" "InviteStatus" NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "householdId" TEXT NOT NULL,
    "invitedByUserId" TEXT NOT NULL,
    CONSTRAINT "household_invites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_invites_token_key" ON "household_invites"("token");
CREATE INDEX "household_invites_householdId_status_idx" ON "household_invites"("householdId", "status");
CREATE INDEX "household_invites_email_status_idx" ON "household_invites"("email", "status");

ALTER TABLE "household_invites"
  ADD CONSTRAINT "household_invites_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "household_import_aliases" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "householdId" TEXT NOT NULL,
    CONSTRAINT "household_import_aliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "household_import_aliases_token_key" ON "household_import_aliases"("token");
CREATE UNIQUE INDEX "household_import_aliases_householdId_key" ON "household_import_aliases"("householdId");

ALTER TABLE "household_import_aliases"
  ADD CONSTRAINT "household_import_aliases_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "accounts" ADD COLUMN "householdId" TEXT;
ALTER TABLE "categories" ADD COLUMN "householdId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "householdId" TEXT;
ALTER TABLE "installment_plans" ADD COLUMN "householdId" TEXT;
ALTER TABLE "recurring_transactions" ADD COLUMN "householdId" TEXT;
ALTER TABLE "import_batches" ADD COLUMN "householdId" TEXT;
ALTER TABLE "bank_account_mappings" ADD COLUMN "householdId" TEXT;
ALTER TABLE "email_import_logs" ADD COLUMN "householdId" TEXT;
ALTER TABLE "budgets" ADD COLUMN "householdId" TEXT;
ALTER TABLE "category_memory" ADD COLUMN "householdId" TEXT;

CREATE TEMP TABLE user_household AS
SELECT u.id AS "userId", gen_random_uuid()::text AS "householdId", u.name AS name
FROM "users" u;

INSERT INTO "households" ("id", "name", "createdAt")
SELECT "householdId", 'Família de ' || name, CURRENT_TIMESTAMP
FROM user_household;

INSERT INTO "household_members" ("id", "role", "joinedAt", "userId", "householdId")
SELECT gen_random_uuid()::text, 'OWNER', CURRENT_TIMESTAMP, "userId", "householdId"
FROM user_household;

UPDATE "accounts" a SET "householdId" = uh."householdId" FROM user_household uh WHERE a."userId" = uh."userId";
UPDATE "categories" c SET "householdId" = uh."householdId" FROM user_household uh WHERE c."userId" = uh."userId";
UPDATE "transactions" t SET "householdId" = uh."householdId" FROM user_household uh WHERE t."userId" = uh."userId";
UPDATE "installment_plans" p SET "householdId" = uh."householdId" FROM user_household uh WHERE p."userId" = uh."userId";
UPDATE "recurring_transactions" r SET "householdId" = uh."householdId" FROM user_household uh WHERE r."userId" = uh."userId";
UPDATE "import_batches" b SET "householdId" = uh."householdId" FROM user_household uh WHERE b."userId" = uh."userId";
UPDATE "bank_account_mappings" m SET "householdId" = uh."householdId" FROM user_household uh WHERE m."userId" = uh."userId";
UPDATE "email_import_logs" l SET "householdId" = uh."householdId" FROM user_household uh WHERE l."userId" = uh."userId";
UPDATE "budgets" g SET "householdId" = uh."householdId" FROM user_household uh WHERE g."userId" = uh."userId";
UPDATE "category_memory" mem SET "householdId" = uh."householdId" FROM user_household uh WHERE mem."userId" = uh."userId";

INSERT INTO "household_import_aliases" ("id", "token", "createdAt", "householdId")
SELECT gen_random_uuid()::text, a."token", a."createdAt", uh."householdId"
FROM "user_import_aliases" a
JOIN user_household uh ON uh."userId" = a."userId"
ON CONFLICT ("token") DO NOTHING;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "accounts" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "categories" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "transactions" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "installment_plans" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "recurring_transactions" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "import_batches" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "bank_account_mappings" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "budgets" WHERE "householdId" IS NULL)
     OR EXISTS (SELECT 1 FROM "category_memory" WHERE "householdId" IS NULL)
  THEN
    RAISE EXCEPTION 'Backfill incompleto: ainda há linhas sem householdId';
  END IF;
END $$;

ALTER TABLE "accounts" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "categories" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "transactions" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "installment_plans" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "recurring_transactions" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "import_batches" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "bank_account_mappings" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "budgets" ALTER COLUMN "householdId" SET NOT NULL;
ALTER TABLE "category_memory" ALTER COLUMN "householdId" SET NOT NULL;

ALTER TABLE "accounts" DROP CONSTRAINT "accounts_userId_fkey";
DROP INDEX "accounts_userId_idx";
ALTER TABLE "accounts" DROP COLUMN "userId";
CREATE INDEX "accounts_householdId_idx" ON "accounts"("householdId");
ALTER TABLE "accounts"
  ADD CONSTRAINT "accounts_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "categories" DROP CONSTRAINT "categories_userId_fkey";
DROP INDEX "categories_userId_name_type_key";
DROP INDEX "categories_userId_idx";
ALTER TABLE "categories" DROP COLUMN "userId";
CREATE UNIQUE INDEX "categories_householdId_name_type_key" ON "categories"("householdId", "name", "type");
CREATE INDEX "categories_householdId_idx" ON "categories"("householdId");
ALTER TABLE "categories"
  ADD CONSTRAINT "categories_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "transactions_householdId_date_idx" ON "transactions"("householdId", "date");
ALTER TABLE "transactions"
  ADD CONSTRAINT "transactions_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "installment_plans" DROP CONSTRAINT "installment_plans_userId_fkey";
DROP INDEX "installment_plans_userId_idx";
ALTER TABLE "installment_plans" DROP COLUMN "userId";
CREATE INDEX "installment_plans_householdId_idx" ON "installment_plans"("householdId");
ALTER TABLE "installment_plans"
  ADD CONSTRAINT "installment_plans_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "recurring_transactions" DROP CONSTRAINT "recurring_transactions_userId_fkey";
DROP INDEX "recurring_transactions_userId_active_idx";
ALTER TABLE "recurring_transactions" DROP COLUMN "userId";
CREATE INDEX "recurring_transactions_householdId_active_idx" ON "recurring_transactions"("householdId", "active");
ALTER TABLE "recurring_transactions"
  ADD CONSTRAINT "recurring_transactions_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_userId_fkey";
DROP INDEX "import_batches_userId_idx";
DROP INDEX "import_batches_userId_status_idx";
ALTER TABLE "import_batches" DROP COLUMN "userId";
CREATE INDEX "import_batches_householdId_idx" ON "import_batches"("householdId");
CREATE INDEX "import_batches_householdId_status_idx" ON "import_batches"("householdId", "status");
ALTER TABLE "import_batches"
  ADD CONSTRAINT "import_batches_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "bank_account_mappings" DROP CONSTRAINT "bank_account_mappings_userId_fkey";
DROP INDEX "bank_account_mappings_userId_bankId_acctId_key";
DROP INDEX "bank_account_mappings_userId_idx";
ALTER TABLE "bank_account_mappings" DROP COLUMN "userId";
CREATE UNIQUE INDEX "bank_account_mappings_householdId_bankId_acctId_key" ON "bank_account_mappings"("householdId", "bankId", "acctId");
CREATE INDEX "bank_account_mappings_householdId_idx" ON "bank_account_mappings"("householdId");
ALTER TABLE "bank_account_mappings"
  ADD CONSTRAINT "bank_account_mappings_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "email_import_logs_householdId_createdAt_idx" ON "email_import_logs"("householdId", "createdAt");
ALTER TABLE "email_import_logs"
  ADD CONSTRAINT "email_import_logs_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "budgets" DROP CONSTRAINT "budgets_userId_fkey";
DROP INDEX "budgets_userId_categoryId_effectiveFrom_idx";
ALTER TABLE "budgets" DROP COLUMN "userId";
CREATE INDEX "budgets_householdId_categoryId_effectiveFrom_idx" ON "budgets"("householdId", "categoryId", "effectiveFrom");
ALTER TABLE "budgets"
  ADD CONSTRAINT "budgets_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "category_memory" DROP CONSTRAINT "category_memory_userId_fkey";
DROP INDEX "category_memory_userId_pattern_categoryId_key";
DROP INDEX "category_memory_userId_pattern_idx";
ALTER TABLE "category_memory" DROP COLUMN "userId";
CREATE UNIQUE INDEX "category_memory_householdId_pattern_categoryId_key" ON "category_memory"("householdId", "pattern", "categoryId");
CREATE INDEX "category_memory_householdId_pattern_idx" ON "category_memory"("householdId", "pattern");
ALTER TABLE "category_memory"
  ADD CONSTRAINT "category_memory_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

DROP TABLE "user_import_aliases";

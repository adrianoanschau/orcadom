-- AlterTable
ALTER TABLE "categories" ADD COLUMN "parentId" TEXT;
ALTER TABLE "categories" ADD COLUMN "isSystem" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "categories" ADD COLUMN "systemKey" TEXT;

-- DropIndex
DROP INDEX "categories_householdId_name_type_key";

-- DropIndex
DROP INDEX "categories_householdId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "categories_householdId_parentId_name_type_key" ON "categories"("householdId", "parentId", "name", "type");

-- CreateIndex
CREATE INDEX "categories_householdId_parentId_idx" ON "categories"("householdId", "parentId");

-- CreateIndex
CREATE UNIQUE INDEX "categories_householdId_systemKey_key" ON "categories"("householdId", "systemKey");

-- Raízes: NULL não colide na unique de irmãs.
CREATE UNIQUE INDEX "categories_root_name_type_key" ON "categories"("householdId", "name", "type") WHERE "parentId" IS NULL;

-- AddForeignKey
ALTER TABLE "categories" ADD CONSTRAINT "categories_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

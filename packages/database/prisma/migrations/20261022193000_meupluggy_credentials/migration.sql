-- CreateTable
CREATE TABLE "meupluggy_credentials" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "clientSecretCipher" TEXT NOT NULL,
    "itemIds" TEXT[],
    "consentExpiresAt" TIMESTAMP(3),
    "lastSyncAt" TIMESTAMP(3),
    "lastAuthReason" TEXT,
    "webhookTokenHash" TEXT NOT NULL,
    "webhookTokenCipher" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,

    CONSTRAINT "meupluggy_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meupluggy_credentials_userId_key" ON "meupluggy_credentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "meupluggy_credentials_webhookTokenHash_key" ON "meupluggy_credentials"("webhookTokenHash");

-- CreateIndex
CREATE INDEX "meupluggy_credentials_householdId_idx" ON "meupluggy_credentials"("householdId");

-- AddForeignKey
ALTER TABLE "meupluggy_credentials" ADD CONSTRAINT "meupluggy_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meupluggy_credentials" ADD CONSTRAINT "meupluggy_credentials_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

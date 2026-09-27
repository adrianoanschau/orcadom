CREATE TABLE "user_onboarding_states" (
    "id" TEXT NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT NOT NULL,

    CONSTRAINT "user_onboarding_states_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_onboarding_states_userId_key" ON "user_onboarding_states"("userId");

ALTER TABLE "user_onboarding_states"
  ADD CONSTRAINT "user_onboarding_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

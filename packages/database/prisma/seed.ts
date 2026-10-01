import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

const { prisma } = await import('../src/index.js');
const { seedSystemCategories } = await import('../src/seed-system-categories.js');

const demoEmail = 'demo@orcadom.local';

async function main(): Promise<void> {
  const passwordHash = await bcrypt.hash('orcadom', 10);
  const user = await prisma.user.upsert({
    where: { email: demoEmail },
    update: {},
    create: {
      name: 'Usuário demo',
      email: demoEmail,
      passwordHash,
    },
  });

  const membership = await prisma.householdMember.findFirst({
    where: { userId: user.id },
    orderBy: { joinedAt: 'asc' },
  });
  const household =
    membership?.householdId
      ? await prisma.household.findUniqueOrThrow({ where: { id: membership.householdId } })
      : await prisma.household.create({
          data: {
            name: 'Família de Usuário demo',
            members: { create: { userId: user.id, role: 'OWNER' } },
          },
        });

  await seedSystemCategories(prisma, household.id);
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

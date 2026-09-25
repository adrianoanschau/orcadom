import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

const { prisma } = await import('../src/index.js');

const demoEmail = 'demo@orcadom.local';

const categories = [
  { name: 'Alimentação', type: 'EXPENSE', icon: 'utensils', color: '#C4462F' },
  { name: 'Transporte', type: 'EXPENSE', icon: 'car', color: '#C4462F' },
  { name: 'Moradia', type: 'EXPENSE', icon: 'home', color: '#C4462F' },
  { name: 'Salário', type: 'INCOME', icon: 'wallet', color: '#2F7D5A' },
] as const;

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

  for (const category of categories) {
    await prisma.category.upsert({
      where: {
        householdId_name_type: {
          householdId: household.id,
          name: category.name,
          type: category.type,
        },
      },
      update: {},
      create: {
        householdId: household.id,
        name: category.name,
        type: category.type,
        icon: category.icon,
        color: category.color,
      },
    });
  }
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

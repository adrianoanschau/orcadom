import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import {
  AccountType,
  CategoryType,
  HouseholdRole,
  PostingStatus,
  Prisma,
  RecurrenceFrequency,
  TransactionType,
} from '../src/generated/prisma/client.js';

loadEnv({
  path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'),
});

const { prisma } = await import('../src/index.js');
const { seedSystemCategories } = await import('../src/seed-system-categories.js');

const STAGING_PASSWORD = 'staging-orcadom';
const resetAll = process.env.STAGING_SEED_RESET === 'true';

const USERS = {
  solo: {
    email: 'solo@staging.orcadom.local',
    name: 'Staging Solo',
  },
  owner: {
    email: 'owner@staging.orcadom.local',
    name: 'Staging Owner',
  },
  member: {
    email: 'member@staging.orcadom.local',
    name: 'Staging Member',
  },
} as const;

const HOUSEHOLD_NAMES = {
  solo: 'Staging Solo',
  family: 'Staging Família',
} as const;

function utcDate(year: number, monthIndex: number, day: number): Date {
  return new Date(Date.UTC(year, monthIndex, day, 12, 0, 0));
}

function monthsAgo(offset: number, day = 5): Date {
  const now = new Date();
  return utcDate(now.getUTCFullYear(), now.getUTCMonth() - offset, day);
}

function addUtcMonths(date: Date, months: number): Date {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + months;
  const day = date.getUTCDate();
  const firstOfMonth = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const lastDay = new Date(
    Date.UTC(firstOfMonth.getUTCFullYear(), firstOfMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  return new Date(
    Date.UTC(
      firstOfMonth.getUTCFullYear(),
      firstOfMonth.getUTCMonth(),
      Math.min(day, lastDay),
      12,
      0,
      0,
    ),
  );
}

function money(value: number | string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function categoryByKey(
  categories: Map<string, { id: string; name: string; type: CategoryType }>,
  key: string,
): { id: string; name: string; type: CategoryType } {
  const category = categories.get(key);
  if (!category) {
    throw new Error(`Categoria ausente no seed de staging: ${key}`);
  }
  return category;
}

async function upsertUser(email: string, name: string, passwordHash: string) {
  return prisma.user.upsert({
    where: { email },
    update: { name, passwordHash },
    create: { email, name, passwordHash },
  });
}

async function findOrCreateHousehold(name: string, ownerUserId: string) {
  const existing = await prisma.household.findFirst({
    where: {
      name,
      members: { some: { userId: ownerUserId, role: HouseholdRole.OWNER } },
    },
  });
  if (existing) {
    return existing;
  }
  return prisma.household.create({
    data: {
      name,
      members: { create: { userId: ownerUserId, role: HouseholdRole.OWNER } },
    },
  });
}

async function ensureMember(householdId: string, userId: string, role: HouseholdRole) {
  await prisma.householdMember.upsert({
    where: { userId_householdId: { userId, householdId } },
    update: { role },
    create: { userId, householdId, role },
  });
}

async function wipeHouseholdFinance(householdId: string): Promise<void> {
  await prisma.transaction.deleteMany({ where: { householdId } });
  await prisma.installmentPlan.deleteMany({ where: { householdId } });
  await prisma.recurringTransaction.deleteMany({ where: { householdId } });
  await prisma.budget.deleteMany({ where: { householdId } });
  await prisma.categoryMemory.deleteMany({ where: { householdId } });
  await prisma.emailImportLog.deleteMany({ where: { householdId } });
  await prisma.importBatch.deleteMany({ where: { householdId } });
  await prisma.bankAccountMapping.deleteMany({ where: { householdId } });
  await prisma.householdImportAlias.deleteMany({ where: { householdId } });
  await prisma.savingsGoal.deleteMany({ where: { householdId } });
  await prisma.reportRequest.deleteMany({ where: { householdId } });
  await prisma.auditLog.deleteMany({ where: { householdId } });
  await prisma.accountAccess.deleteMany({
    where: { account: { householdId } },
  });
  await prisma.account.deleteMany({ where: { householdId } });
  await prisma.category.deleteMany({ where: { householdId } });
}

async function wipeStagingUsersAndHouseholds(): Promise<void> {
  const emails = Object.values(USERS).map((u) => u.email);
  const users = await prisma.user.findMany({ where: { email: { in: emails } } });
  const userIds = users.map((u) => u.id);
  const memberships = await prisma.householdMember.findMany({
    where: { userId: { in: userIds } },
    select: { householdId: true },
  });
  const householdIds = [...new Set(memberships.map((m) => m.householdId))];

  for (const householdId of householdIds) {
    await wipeHouseholdFinance(householdId);
    await prisma.householdInvite.deleteMany({ where: { householdId } });
    await prisma.householdMember.deleteMany({ where: { householdId } });
    await prisma.household.delete({ where: { id: householdId } });
  }

  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function seedCategories(householdId: string) {
  return seedSystemCategories(prisma, householdId);
}

async function seedAccounts(householdId: string) {
  const checking = await prisma.account.create({
    data: {
      householdId,
      name: 'Conta Corrente',
      type: AccountType.CHECKING,
      balance: money(0),
      color: '#2F5D8A',
    },
  });
  const card = await prisma.account.create({
    data: {
      householdId,
      name: 'Cartão Crédito',
      type: AccountType.CREDIT_CARD,
      balance: money(0),
      color: '#8A2F5D',
    },
  });
  const wallet = await prisma.account.create({
    data: {
      householdId,
      name: 'Poupança',
      type: AccountType.WALLET,
      balance: money(0),
      color: '#2F7D5A',
    },
  });
  return { checking, card, wallet };
}

async function seedFamilyFinance(householdId: string, userId: string): Promise<void> {
  const categories = await seedCategories(householdId);
  const accounts = await seedAccounts(householdId);
  const alimentation = categoryByKey(categories, 'GROCERIES');
  const transport = categoryByKey(categories, 'TRANSPORT');
  const housing = categoryByKey(categories, 'HOUSING');
  const leisure = categoryByKey(categories, 'LEISURE_TRAVEL');
  const salary = categoryByKey(categories, 'SALARY');
  const freelance = categoryByKey(categories, 'FREELANCE');

  const txns: Prisma.TransactionCreateManyInput[] = [];
  for (const offset of [2, 1, 0]) {
    const salaryDate = monthsAgo(offset, 1);
    txns.push({
      householdId,
      userId,
      description: 'Salário mensal',
      amount: money(8500),
      type: TransactionType.INCOME,
      date: salaryDate,
      accountId: accounts.checking.id,
      categoryId: salary.id,
      postingStatus: PostingStatus.POSTED,
    });
    txns.push({
      householdId,
      userId,
      description: 'Supermercado',
      amount: money(620 + offset * 40),
      type: TransactionType.EXPENSE,
      date: monthsAgo(offset, 8),
      accountId: accounts.checking.id,
      categoryId: alimentation.id,
      postingStatus: PostingStatus.POSTED,
    });
    txns.push({
      householdId,
      userId,
      description: 'Combustível',
      amount: money(280),
      type: TransactionType.EXPENSE,
      date: monthsAgo(offset, 12),
      accountId: accounts.checking.id,
      categoryId: transport.id,
      postingStatus: PostingStatus.POSTED,
    });
    txns.push({
      householdId,
      userId,
      description: 'Aluguel',
      amount: money(2200),
      type: TransactionType.EXPENSE,
      date: monthsAgo(offset, 5),
      accountId: accounts.checking.id,
      categoryId: housing.id,
      postingStatus: PostingStatus.POSTED,
    });
    if (offset === 0) {
      txns.push({
        householdId,
        userId,
        description: 'Freelance design',
        amount: money(1200),
        type: TransactionType.INCOME,
        date: monthsAgo(0, 18),
        accountId: accounts.checking.id,
        categoryId: freelance.id,
        postingStatus: PostingStatus.POSTED,
      });
    }
  }

  txns.push({
    householdId,
    userId,
    description: 'Transferência para poupança',
    amount: money(500),
    type: TransactionType.TRANSFER,
    date: monthsAgo(0, 20),
    fromAccountId: accounts.checking.id,
    toAccountId: accounts.wallet.id,
    postingStatus: PostingStatus.POSTED,
  });

  await prisma.transaction.createMany({ data: txns });

  // Approximate balances after seeded movements (seed does not use applyBalance).
  await prisma.account.update({
    where: { id: accounts.checking.id },
    data: { balance: money(8500 * 3 + 1200 - (660 + 620 + 700) - 280 * 3 - 2200 * 3 - 500) },
  });
  await prisma.account.update({
    where: { id: accounts.wallet.id },
    data: { balance: money(500) },
  });

  const budgetFrom = monthsAgo(0, 1);
  await prisma.budget.createMany({
    data: [
      {
        householdId,
        categoryId: alimentation.id,
        amount: money(800),
        effectiveFrom: budgetFrom,
      },
      {
        householdId,
        categoryId: leisure.id,
        amount: money(400),
        effectiveFrom: budgetFrom,
      },
    ],
  });

  const purchaseDate = monthsAgo(1, 3);
  const installmentsCount = 6;
  const totalAmount = money(1800);
  const base = totalAmount
    .dividedBy(installmentsCount)
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
  const remainder = totalAmount.minus(base.times(installmentsCount));
  const plan = await prisma.installmentPlan.create({
    data: {
      householdId,
      description: 'Notebook',
      totalAmount,
      installmentsCount,
      purchaseDate,
      accountId: accounts.card.id,
      categoryId: leisure.id,
    },
  });

  let cardBalance = money(0);
  for (let i = 0; i < installmentsCount; i += 1) {
    const date = addUtcMonths(purchaseDate, i);
    const amount = i === installmentsCount - 1 ? base.plus(remainder) : base;
    const posted = date.getTime() <= Date.now();
    await prisma.transaction.create({
      data: {
        householdId,
        userId,
        description: `Notebook (${String(i + 1)}/${String(installmentsCount)})`,
        amount,
        type: TransactionType.EXPENSE,
        date,
        accountId: accounts.card.id,
        categoryId: leisure.id,
        postingStatus: posted ? PostingStatus.POSTED : PostingStatus.SCHEDULED,
        installmentPlanId: plan.id,
        installmentNumber: i + 1,
      },
    });
    if (posted) {
      cardBalance = cardBalance.minus(amount);
    }
  }
  await prisma.account.update({
    where: { id: accounts.card.id },
    data: { balance: cardBalance },
  });

  await prisma.recurringTransaction.create({
    data: {
      householdId,
      description: 'Assinatura streaming',
      amount: money(55.9),
      type: TransactionType.EXPENSE,
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 10,
      startDate: monthsAgo(3, 10),
      active: true,
      accountId: accounts.checking.id,
      categoryId: leisure.id,
    },
  });
  await prisma.recurringTransaction.create({
    data: {
      householdId,
      description: 'Salário recorrente',
      amount: money(8500),
      type: TransactionType.INCOME,
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 1,
      startDate: monthsAgo(6, 1),
      active: true,
      accountId: accounts.checking.id,
      categoryId: salary.id,
    },
  });
}

async function seedSoloFinance(householdId: string, userId: string): Promise<void> {
  const categories = await seedCategories(householdId);
  const accounts = await seedAccounts(householdId);
  const alimentation = categoryByKey(categories, 'GROCERIES');
  const salary = categoryByKey(categories, 'SALARY');

  await prisma.transaction.createMany({
    data: [
      {
        householdId,
        userId,
        description: 'Salário',
        amount: money(4500),
        type: TransactionType.INCOME,
        date: monthsAgo(0, 2),
        accountId: accounts.checking.id,
        categoryId: salary.id,
        postingStatus: PostingStatus.POSTED,
      },
      {
        householdId,
        userId,
        description: 'Mercado',
        amount: money(310),
        type: TransactionType.EXPENSE,
        date: monthsAgo(0, 7),
        accountId: accounts.checking.id,
        categoryId: alimentation.id,
        postingStatus: PostingStatus.POSTED,
      },
      {
        householdId,
        userId,
        description: 'Reserva',
        amount: money(200),
        type: TransactionType.TRANSFER,
        date: monthsAgo(0, 9),
        fromAccountId: accounts.checking.id,
        toAccountId: accounts.wallet.id,
        postingStatus: PostingStatus.POSTED,
      },
    ],
  });

  await prisma.account.update({
    where: { id: accounts.checking.id },
    data: { balance: money(4500 - 310 - 200) },
  });
  await prisma.account.update({
    where: { id: accounts.wallet.id },
    data: { balance: money(200) },
  });

  await prisma.budget.create({
    data: {
      householdId,
      categoryId: alimentation.id,
      amount: money(500),
      effectiveFrom: monthsAgo(0, 1),
    },
  });

  await prisma.recurringTransaction.create({
    data: {
      householdId,
      description: 'Academia',
      amount: money(99),
      type: TransactionType.EXPENSE,
      frequency: RecurrenceFrequency.MONTHLY,
      dayOfMonth: 15,
      startDate: monthsAgo(2, 15),
      active: true,
      accountId: accounts.checking.id,
      categoryId: alimentation.id,
    },
  });
}

async function main(): Promise<void> {
  if (resetAll) {
    console.log('STAGING_SEED_RESET=true — removendo users/households de staging…');
    await wipeStagingUsersAndHouseholds();
  }

  const passwordHash = await bcrypt.hash(STAGING_PASSWORD, 10);
  const soloUser = await upsertUser(USERS.solo.email, USERS.solo.name, passwordHash);
  const ownerUser = await upsertUser(USERS.owner.email, USERS.owner.name, passwordHash);
  const memberUser = await upsertUser(USERS.member.email, USERS.member.name, passwordHash);

  const soloHousehold = await findOrCreateHousehold(HOUSEHOLD_NAMES.solo, soloUser.id);
  const familyHousehold = await findOrCreateHousehold(HOUSEHOLD_NAMES.family, ownerUser.id);
  await ensureMember(familyHousehold.id, memberUser.id, HouseholdRole.MEMBER);

  await wipeHouseholdFinance(soloHousehold.id);
  await wipeHouseholdFinance(familyHousehold.id);

  await seedSoloFinance(soloHousehold.id, soloUser.id);
  await seedFamilyFinance(familyHousehold.id, ownerUser.id);

  console.log('Seed de staging concluído.');
  console.log('Credenciais (senha para todos):', STAGING_PASSWORD);
  console.log(`  ${USERS.solo.email}  — household "${HOUSEHOLD_NAMES.solo}"`);
  console.log(`  ${USERS.owner.email} — household "${HOUSEHOLD_NAMES.family}" (OWNER)`);
  console.log(`  ${USERS.member.email} — household "${HOUSEHOLD_NAMES.family}" (MEMBER)`);
  console.log('Re-executar limpa e recria dados financeiros desses households.');
  console.log('Wipe total (users + households): STAGING_SEED_RESET=true pnpm db:seed:staging');
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}

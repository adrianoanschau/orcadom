import { expect, test } from '@playwright/test';
import { householdHeaders, listAccounts } from '../helpers/api.js';
import { createWorkspace } from '../helpers/fixtures.js';
import {
  backdateNextScheduledInstallment,
  countRecurringOccurrences,
  getPostingStatus,
  runE2eJob,
  wipeRecurringOccurrences,
} from '../helpers/jobs.js';

test('installment posting job is idempotent', async ({ request }) => {
  const workspace = await createWorkspace(request, { checkingBalance: 5000 });

  const planResponse = await request.post('/installment-plans', {
    headers: householdHeaders(workspace.household.id),
    data: {
      description: 'Compra parcelada E2E',
      totalAmount: 300,
      installmentsCount: 3,
      purchaseDate: new Date().toISOString(),
      accountId: workspace.checking.id,
      categoryId: workspace.expenseCategory.id,
    },
  });
  expect(planResponse.ok(), await planResponse.text()).toBeTruthy();
  const plan = (await planResponse.json()) as {
    id: string;
    installments: Array<{ id: string; postingStatus: string }>;
  };
  expect(plan.installments.some((row) => row.postingStatus === 'SCHEDULED')).toBeTruthy();

  const scheduledId = await backdateNextScheduledInstallment(plan.id);
  const before = await listAccounts(request, workspace.household.id);
  const balanceBefore = Number(
    before.find((row) => row.id === workspace.checking.id)?.balance ?? '0',
  );

  const first = await runE2eJob('posting');
  expect(first).toBeGreaterThanOrEqual(1);
  expect(await getPostingStatus(scheduledId)).toBe('POSTED');

  const after = await listAccounts(request, workspace.household.id);
  const balanceAfter = Number(
    after.find((row) => row.id === workspace.checking.id)?.balance ?? '0',
  );
  expect(balanceAfter).toBeLessThan(balanceBefore);

  const second = await runE2eJob('posting');
  expect(second).toBe(0);
  expect(await getPostingStatus(scheduledId)).toBe('POSTED');
});

test('recurring generation job is idempotent', async ({ request }) => {
  const workspace = await createWorkspace(request, { checkingBalance: 2000 });
  const start = new Date();
  start.setUTCDate(start.getUTCDate() - 1);
  start.setUTCHours(12, 0, 0, 0);

  const createResponse = await request.post('/recurring-transactions', {
    headers: householdHeaders(workspace.household.id),
    data: {
      description: 'Assinatura E2E',
      amount: 49.9,
      type: 'EXPENSE',
      frequency: 'WEEKLY',
      startDate: start.toISOString(),
      accountId: workspace.checking.id,
      categoryId: workspace.expenseCategory.id,
    },
  });
  expect(createResponse.ok(), await createResponse.text()).toBeTruthy();
  const recurring = (await createResponse.json()) as { id: string };
  const initialCount = await countRecurringOccurrences(recurring.id);
  expect(initialCount).toBeGreaterThanOrEqual(1);

  const wiped = await wipeRecurringOccurrences(recurring.id);
  expect(wiped).toBe(initialCount);
  expect(await countRecurringOccurrences(recurring.id)).toBe(0);

  const regenerated = await runE2eJob('recurring');
  expect(regenerated).toBeGreaterThanOrEqual(1);
  expect(await countRecurringOccurrences(recurring.id)).toBe(initialCount);

  const again = await runE2eJob('recurring');
  expect(again).toBe(0);
  expect(await countRecurringOccurrences(recurring.id)).toBe(initialCount);
});

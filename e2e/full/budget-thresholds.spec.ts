import { expect, test } from '@playwright/test';
import { createTransaction, householdHeaders } from '../helpers/api.js';
import { createWorkspace } from '../helpers/fixtures.js';

function currentMonth(): string {
  const now = new Date();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${String(now.getUTCFullYear())}-${month}`;
}

test('budget status crosses warning 80% and exceeded 100%', async ({ request }) => {
  const workspace = await createWorkspace(request, { checkingBalance: 5000 });
  const month = currentMonth();
  const limit = 1000;

  const budgetResponse = await request.post('/budgets', {
    headers: householdHeaders(workspace.household.id),
    data: { categoryId: workspace.expenseCategory.id, amount: limit },
  });
  expect(budgetResponse.ok(), await budgetResponse.text()).toBeTruthy();

  const today = new Date().toISOString();

  await createTransaction(request, workspace.household.id, {
    description: 'Gasto warning',
    amount: 800,
    type: 'EXPENSE',
    date: today,
    accountId: workspace.checking.id,
    categoryId: workspace.expenseCategory.id,
  });

  let list = await request.get(`/budgets?month=${month}`, {
    headers: householdHeaders(workspace.household.id),
  });
  expect(list.ok(), await list.text()).toBeTruthy();
  let body = (await list.json()) as {
    budgets: Array<{ categoryId: string; status: string; ratio: number }>;
  };
  let row = body.budgets.find((item) => item.categoryId === workspace.expenseCategory.id);
  expect(row?.status).toBe('warning');
  expect(row?.ratio).toBeGreaterThanOrEqual(0.8);

  await createTransaction(request, workspace.household.id, {
    description: 'Gasto exceeded',
    amount: 250,
    type: 'EXPENSE',
    date: today,
    accountId: workspace.checking.id,
    categoryId: workspace.expenseCategory.id,
  });

  list = await request.get(`/budgets?month=${month}`, {
    headers: householdHeaders(workspace.household.id),
  });
  expect(list.ok(), await list.text()).toBeTruthy();
  body = await list.json();
  row = body.budgets.find((item) => item.categoryId === workspace.expenseCategory.id);
  expect(row?.status).toBe('exceeded');
  expect(row?.ratio).toBeGreaterThanOrEqual(1);
});

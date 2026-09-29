import { expect, test } from '@playwright/test';
import { createTransaction, listAccounts } from '../helpers/api.js';
import { createWorkspace } from '../helpers/fixtures.js';

test('transfer moves balance between accounts', async ({ request }) => {
  const workspace = await createWorkspace(request, {
    checkingBalance: 1000,
    savingsBalance: 200,
  });
  const amount = 150;

  await createTransaction(request, workspace.household.id, {
    description: 'Transferência E2E',
    amount,
    type: 'TRANSFER',
    date: new Date().toISOString(),
    fromAccountId: workspace.checking.id,
    toAccountId: workspace.savings.id,
  });

  const accounts = await listAccounts(request, workspace.household.id);
  const checking = accounts.find((row) => row.id === workspace.checking.id);
  const savings = accounts.find((row) => row.id === workspace.savings.id);

  expect(checking?.balance).toBe('850.00');
  expect(savings?.balance).toBe('350.00');
});

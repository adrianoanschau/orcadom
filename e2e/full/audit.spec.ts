import { expect, test } from '@playwright/test';
import { createAccount, householdHeaders } from '../helpers/api.js';
import { createWorkspace } from '../helpers/fixtures.js';

test('creating an account writes an audit log entry', async ({ request }) => {
  const workspace = await createWorkspace(request);
  const account = await createAccount(request, workspace.household.id, {
    name: `Audit Account ${Date.now()}`,
    type: 'WALLET',
    balance: 10,
  });

  const response = await request.get('/audit-logs?entityType=Account&limit=20', {
    headers: householdHeaders(workspace.household.id),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  const logs = (await response.json()) as Array<{
    entityType: string;
    entityId: string;
    action: string;
  }>;

  const match = logs.find(
    (row) => row.entityType === 'Account' && row.entityId === account.id && row.action === 'CREATE',
  );
  expect(match).toBeTruthy();
});

import { expect, test } from '@playwright/test';
import {
  expectStatus,
  listAccounts,
  listHouseholds,
  register,
} from '../helpers/api.js';
import { createWorkspace } from '../helpers/fixtures.js';

test('foreign household id is rejected with 403', async ({ playwright }) => {
  const contextA = await playwright.request.newContext({
    baseURL: process.env.E2E_API_URL ?? 'http://127.0.0.1:8080',
  });
  const contextB = await playwright.request.newContext({
    baseURL: process.env.E2E_API_URL ?? 'http://127.0.0.1:8080',
  });

  try {
    const workspaceA = await createWorkspace(contextA, { name: 'User A' });
    await register(contextB, { name: 'User B' });
    const householdsB = await listHouseholds(contextB);
    const householdB = householdsB[0];
    expect(householdB).toBeTruthy();
    expect(householdB!.id).not.toBe(workspaceA.household.id);

    const denied = await contextB.get('/accounts', {
      headers: { 'X-Household-Id': workspaceA.household.id },
    });
    await expectStatus(denied, 403);

    const own = await listAccounts(contextB, householdB!.id);
    expect(Array.isArray(own)).toBeTruthy();
  } finally {
    await contextA.dispose();
    await contextB.dispose();
  }
});

import { type APIRequestContext, expect } from '@playwright/test';

export type Household = {
  id: string;
  name: string;
  role: string;
};

export type Account = {
  id: string;
  name: string;
  balance: string;
};

export type Category = {
  id: string;
  name: string;
  type: string;
};

export function uniqueEmail(prefix = 'e2e'): string {
  return `${prefix}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@e2e.orcadom.local`;
}

export async function register(
  request: APIRequestContext,
  opts?: { name?: string; email?: string; password?: string },
) {
  const email = opts?.email ?? uniqueEmail();
  const password = opts?.password ?? 'e2e-password-ok';
  const name = opts?.name ?? 'E2E User';
  const response = await request.post('/auth/register', {
    data: { name, email, password },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return { email, password, name, user: await response.json() };
}

export async function login(
  request: APIRequestContext,
  email: string,
  password: string,
  remember = false,
) {
  const response = await request.post('/auth/login', {
    data: { email, password, remember },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function listHouseholds(request: APIRequestContext): Promise<Household[]> {
  const response = await request.get('/households');
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export function householdHeaders(householdId: string): Record<string, string> {
  return { 'X-Household-Id': householdId };
}

export async function createAccount(
  request: APIRequestContext,
  householdId: string,
  data: { name: string; type?: 'WALLET' | 'CHECKING' | 'CREDIT_CARD'; balance?: number },
): Promise<Account> {
  const response = await request.post('/accounts', {
    headers: householdHeaders(householdId),
    data: {
      name: data.name,
      type: data.type ?? 'CHECKING',
      balance: data.balance ?? 0,
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function listAccounts(
  request: APIRequestContext,
  householdId: string,
): Promise<Account[]> {
  const response = await request.get('/accounts', {
    headers: householdHeaders(householdId),
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function createCategory(
  request: APIRequestContext,
  householdId: string,
  data: { name: string; type: 'INCOME' | 'EXPENSE' },
): Promise<Category> {
  const response = await request.post('/categories', {
    headers: householdHeaders(householdId),
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function createTransaction(
  request: APIRequestContext,
  householdId: string,
  data: Record<string, unknown>,
) {
  const response = await request.post('/transactions', {
    headers: householdHeaders(householdId),
    data,
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  return response.json();
}

export async function expectStatus(
  response: Awaited<ReturnType<APIRequestContext['fetch']>>,
  status: number,
) {
  expect(response.status(), await response.text()).toBe(status);
}

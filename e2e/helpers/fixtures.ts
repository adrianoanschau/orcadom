import { type APIRequestContext } from '@playwright/test';
import {
  createAccount,
  createCategory,
  listHouseholds,
  register,
  type Account,
  type Category,
  type Household,
} from './api.js';

export type TestWorkspace = {
  email: string;
  password: string;
  household: Household;
  checking: Account;
  savings: Account;
  expenseCategory: Category;
};

/** Registra usuário fresco com household, 2 contas e 1 categoria de despesa. */
export async function createWorkspace(
  request: APIRequestContext,
  opts?: { checkingBalance?: number; savingsBalance?: number; name?: string },
): Promise<TestWorkspace> {
  const { email, password } = await register(request, { name: opts?.name });
  const households = await listHouseholds(request);
  const household = households[0];
  if (!household) {
    throw new Error('Registro não criou household.');
  }

  const checking = await createAccount(request, household.id, {
    name: 'Corrente E2E',
    type: 'CHECKING',
    balance: opts?.checkingBalance ?? 1000,
  });
  const savings = await createAccount(request, household.id, {
    name: 'Poupança E2E',
    type: 'CHECKING',
    balance: opts?.savingsBalance ?? 200,
  });
  const expenseCategory = await createCategory(request, household.id, {
    name: `Despesa ${Date.now()}`,
    type: 'EXPENSE',
  });

  return { email, password, household, checking, savings, expenseCategory };
}

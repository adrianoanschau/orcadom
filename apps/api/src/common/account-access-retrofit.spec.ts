import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const apiRoot = resolve(import.meta.dirname, '../..');

const ACCOUNT_SCOPED_SOURCES = [
  'src/modules/accounts/accounts.service.ts',
  'src/modules/transactions/transactions.service.ts',
  'src/modules/dashboard/dashboard.service.ts',
  'src/modules/installment-plans/installment-plans.service.ts',
  'src/modules/recurring-transactions/recurring-transactions.service.ts',
  'src/modules/savings-goals/savings-goals.service.ts',
  'src/modules/reports/reports.service.ts',
  'src/modules/imports/imports.service.ts',
  'src/modules/bank-account-mappings/bank-account-mappings.service.ts',
  'src/modules/audit-logs/audit-logs.service.ts',
  'src/modules/onboarding/onboarding-steps.ts',
  'src/modules/notifications/notifications.service.ts',
  'src/modules/settings/settings.service.ts',
  'src/common/transaction-filters.ts',
];

const HELPER_IMPORT = /from ['"].*account-access\.js['"]/;

describe('retrofit de acesso por conta', () => {
  it.each(ACCOUNT_SCOPED_SOURCES)('%s usa o helper central de contas acessíveis', (relative) => {
    const source = readFileSync(resolve(apiRoot, relative), 'utf8');
    expect(source).toMatch(HELPER_IMPORT);
    expect(source).toMatch(
      /getAccessibleAccountIds|accessibleAccountWhere|assertAccountAccessible|transactionTouchesAccessibleAccounts/,
    );
  });
});

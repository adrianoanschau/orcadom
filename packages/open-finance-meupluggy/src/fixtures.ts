export const MEUPLUGGY_DEMO_ITEM_ID = '11111111-1111-4111-8111-111111111111';
export const MEUPLUGGY_CHECKING_ID = '22222222-2222-4222-8222-222222222222';
export const MEUPLUGGY_CARD_ID = '33333333-3333-4333-8333-333333333333';
export const MEUPLUGGY_BILL_ID = '44444444-4444-4444-8444-444444444444';
export const MEUPLUGGY_BILL_AMOUNT = 2500;
export const MEUPLUGGY_PAGE_SIZE = 20;

export interface PluggyFixtureTransaction {
  id: string;
  description: string;
  amount: number;
  date: string;
  category: string;
  accountId: string;
  status: 'POSTED';
  type: 'DEBIT' | 'CREDIT';
  creditCardMetadata?: {
    billId?: string;
    installmentNumber?: number;
    totalInstallments?: number;
  };
}

function daysAgo(now: Date, days: number): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - days, 12, 0, 0)).toISOString();
}

export function checkingFixtures(now = new Date()): PluggyFixtureTransaction[] {
  const rows: PluggyFixtureTransaction[] = [];
  for (let index = 0; index < 24; index += 1) {
    rows.push({
      id: `chk-${String(index).padStart(2, '0')}`,
      description: `Compra ${String(index)}`,
      amount: -(10 + index),
      date: daysAgo(now, 2 + (index % 40)),
      category: 'Shopping',
      accountId: MEUPLUGGY_CHECKING_ID,
      status: 'POSTED',
      type: 'DEBIT',
    });
  }
  rows.push({
    id: 'chk-bill-payment',
    description: 'Pagamento fatura',
    amount: -MEUPLUGGY_BILL_AMOUNT,
    date: daysAgo(now, 12),
    category: 'Credit card payment',
    accountId: MEUPLUGGY_CHECKING_ID,
    status: 'POSTED',
    type: 'DEBIT',
  });
  return rows.sort((left, right) => left.id.localeCompare(right.id));
}

export function cardFixtures(now = new Date()): PluggyFixtureTransaction[] {
  return [
    {
      id: 'card-bill-payment',
      description: 'Pagamento fatura',
      amount: -MEUPLUGGY_BILL_AMOUNT,
      date: daysAgo(now, 12),
      category: 'Credit card payment',
      accountId: MEUPLUGGY_CARD_ID,
      status: 'POSTED',
      type: 'CREDIT',
      creditCardMetadata: { billId: MEUPLUGGY_BILL_ID },
    },
    {
      id: 'card-installment',
      description: 'Mercado',
      amount: 89.9,
      date: daysAgo(now, 20),
      category: 'Groceries',
      accountId: MEUPLUGGY_CARD_ID,
      status: 'POSTED',
      type: 'DEBIT',
      creditCardMetadata: {
        billId: MEUPLUGGY_BILL_ID,
        installmentNumber: 2,
        totalInstallments: 3,
      },
    },
  ];
}

export function transactionsFor(accountId: string, now = new Date()): PluggyFixtureTransaction[] {
  if (accountId === MEUPLUGGY_CHECKING_ID) return checkingFixtures(now);
  if (accountId === MEUPLUGGY_CARD_ID) return cardFixtures(now);
  return [];
}

export function transactionPage(
  accountId: string,
  params: URLSearchParams,
  now = new Date(),
): { results: PluggyFixtureTransaction[]; next: string | null } {
  const all = transactionsFor(accountId, now);
  const after = params.get('after');
  let start = 0;
  if (after) {
    const index = all.findIndex((row) => row.id === after);
    if (index < 0) return { results: [], next: null };
    start = index + 1;
  }
  const results = all.slice(start, start + MEUPLUGGY_PAGE_SIZE);
  const last = results[results.length - 1];
  if (!last || start + results.length >= all.length) return { results, next: null };
  const next = new URLSearchParams(params);
  next.set('after', last.id);
  return { results, next: `?${next.toString()}` };
}

export function accountFixtures() {
  return [
    {
      id: MEUPLUGGY_CHECKING_ID,
      type: 'BANK',
      subtype: 'CHECKING_ACCOUNT',
      number: '0001/12345-0',
      name: 'Conta corrente',
      balance: 1500.5,
      currencyCode: 'BRL',
      itemId: MEUPLUGGY_DEMO_ITEM_ID,
    },
    {
      id: MEUPLUGGY_CARD_ID,
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      number: 'xxxx8670',
      name: 'Cartão',
      balance: -800,
      currencyCode: 'BRL',
      itemId: MEUPLUGGY_DEMO_ITEM_ID,
      creditData: { creditLimit: 5000 },
    },
  ];
}

export function itemFixture(id: string, now = new Date()) {
  return {
    id,
    status: 'UPDATED',
    lastUpdatedAt: daysAgo(now, 1),
    consentExpiresAt: new Date(now.getTime() + 200 * 24 * 60 * 60 * 1000).toISOString(),
    connector: { name: 'Banco Anônimo' },
    error: null,
  };
}

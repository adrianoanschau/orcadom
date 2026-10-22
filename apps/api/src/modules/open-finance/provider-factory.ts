import { FakeOpenFinanceProvider, FAKE_WEBHOOK_SECRET } from '@orcadom/open-finance-testing';
import type { OpenFinanceProvider } from '@orcadom/open-finance-core';

export const OPEN_FINANCE_PROVIDER = 'OPEN_FINANCE_PROVIDER';

export interface OpenFinanceEnv {
  NODE_ENV?: string;
  OPEN_FINANCE_PROVIDER?: string;
  OPEN_FINANCE_WEBHOOK_SECRET?: string;
}

export function resolveOpenFinanceProviderName(env: OpenFinanceEnv): 'fake' | null {
  const explicit = env.OPEN_FINANCE_PROVIDER?.trim() ?? '';
  if (explicit === 'fake') {
    if (env.NODE_ENV === 'production') {
      throw new Error('OPEN_FINANCE_PROVIDER=fake is refused when NODE_ENV=production');
    }
    return 'fake';
  }
  if (explicit === '') return env.NODE_ENV === 'production' ? null : 'fake';
  throw new Error(`Unknown OPEN_FINANCE_PROVIDER "${explicit}"`);
}

export function createOpenFinanceProvider(env: OpenFinanceEnv): OpenFinanceProvider | null {
  const name = resolveOpenFinanceProviderName(env);
  if (name !== 'fake') return null;
  const secret = env.OPEN_FINANCE_WEBHOOK_SECRET?.trim();
  if (!secret) return new FakeOpenFinanceProvider(FAKE_WEBHOOK_SECRET);
  return new FakeOpenFinanceProvider(secret);
}

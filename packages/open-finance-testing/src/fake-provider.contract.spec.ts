import { runProviderContractTests } from '@orcadom/open-finance-core/contract';
import { describe, expect, it } from 'vitest';
import {
  FAKE_CONNECTION_ID,
  FAKE_WEBHOOK_HEADER,
  FakeOpenFinanceProvider,
  signFakeWebhook,
} from './fake-provider.js';

runProviderContractTests(() => ({
  provider: new FakeOpenFinanceProvider(),
  connectionId: FAKE_CONNECTION_ID,
}));

describe('fake webhook', () => {
  it('accepts a body signed with the fixed secret', () => {
    const provider = new FakeOpenFinanceProvider();
    const raw = JSON.stringify({
      type: 'TRANSACTIONS_AVAILABLE',
      connectionId: FAKE_CONNECTION_ID,
      payload: { reason: 'new' },
    });
    const event = provider.parseWebhook({ [FAKE_WEBHOOK_HEADER]: signFakeWebhook(raw) }, raw);
    expect(event?.type).toBe('TRANSACTIONS_AVAILABLE');
    expect(event?.connectionId).toBe(FAKE_CONNECTION_ID);
  });
});

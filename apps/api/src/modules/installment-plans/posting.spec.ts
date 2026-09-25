import { describe, expect, it } from 'vitest';
import { postIfScheduled, shouldPost } from './posting.js';

describe('shouldPost', () => {
  it('só postagem se ainda estiver agendada', () => {
    expect(shouldPost({ postingStatus: 'SCHEDULED' })).toBe(true);
    expect(shouldPost({ postingStatus: 'POSTED' })).toBe(false);
    expect(shouldPost(null)).toBe(false);
  });
});

describe('postIfScheduled', () => {
  it('debita uma vez e ignora a segunda execução', async () => {
    const fake = createFakeTx();
    expect(await postIfScheduled(fake, 'tx-1')).toBe('posted');
    expect(fake.balanceCalls).toBe(1);
    expect(fake.status).toBe('POSTED');
    expect(await postIfScheduled(fake, 'tx-1')).toBe('skipped');
    expect(fake.balanceCalls).toBe(1);
  });
});

function createFakeTx() {
  const state = { status: 'SCHEDULED', balanceCalls: 0 };
  return {
    get status() {
      return state.status;
    },
    get balanceCalls() {
      return state.balanceCalls;
    },
    transaction: {
      findUnique: () =>
        Promise.resolve({
          id: 'tx-1',
          postingStatus: state.status,
          type: 'EXPENSE',
          amount: '10.00',
          accountId: 'acc-1',
          fromAccountId: null,
          toAccountId: null,
        }),
      update: () => {
        state.status = 'POSTED';
        return Promise.resolve();
      },
    },
    account: {
      update: () => {
        state.balanceCalls += 1;
        return Promise.resolve();
      },
    },
  };
}

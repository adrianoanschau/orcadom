import { NotFoundException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { restrictAccountSchema } from '@orcadom/types';
import {
  accessibleAccountWhere,
  assertAccountAccessible,
  getAccessibleAccountIds,
  redactInaccessibleAccountId,
  resolveRestrictMemberIds,
  transactionTouchesAccessibleAccounts,
  type AccountAccessReader,
} from './account-access.js';

function mockReader(rows: Array<{ id: string }>): AccountAccessReader {
  return {
    account: {
      findMany: async () => rows,
      findFirst: async (args) => rows.find((row) => row.id === args.where.id) ?? null,
    },
  };
}

describe('accessibleAccountWhere', () => {
  it('contas livres ficam visíveis e restritas só com AccountAccess', () => {
    expect(accessibleAccountWhere('hh-1', 'mem-1')).toEqual({
      householdId: 'hh-1',
      OR: [{ isRestricted: false }, { accountAccess: { some: { householdMemberId: 'mem-1' } } }],
    });
  });

  it('OWNER sem linha de acesso não entra pelo papel', () => {
    const where = accessibleAccountWhere('hh-1', 'owner-member');
    expect(where.OR).not.toEqual(expect.arrayContaining([expect.objectContaining({ role: 'OWNER' })]));
    expect(where.OR[1]).toEqual({ accountAccess: { some: { householdMemberId: 'owner-member' } } });
  });
});

describe('getAccessibleAccountIds', () => {
  it('devolve só os ids retornados pelo filtro central', async () => {
    await expect(getAccessibleAccountIds(mockReader([{ id: 'acc-livre' }, { id: 'acc-ok' }]), 'hh-1', 'mem-1')).resolves.toEqual([
      'acc-livre',
      'acc-ok',
    ]);
  });
});

describe('assertAccountAccessible', () => {
  it('esconde conta restrita sem acesso com o mesmo 404', async () => {
    await expect(assertAccountAccessible(mockReader([]), 'hh-1', 'mem-1', 'acc-secreta')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('aceita conta presente no conjunto visível', async () => {
    await expect(
      assertAccountAccessible(mockReader([{ id: 'acc-ok' }]), 'hh-1', 'mem-1', 'acc-ok'),
    ).resolves.toBeUndefined();
  });
});

describe('transactionTouchesAccessibleAccounts', () => {
  it('abre o lançamento se qualquer ponta da conta for visível', () => {
    expect(transactionTouchesAccessibleAccounts(['acc-1'])).toEqual({
      OR: [
        { accountId: { in: ['acc-1'] } },
        { fromAccountId: { in: ['acc-1'] } },
        { toAccountId: { in: ['acc-1'] } },
      ],
    });
  });
});

describe('redactInaccessibleAccountId', () => {
  it('omite contraparte que o membro não pode ver', () => {
    const visible = new Set(['acc-visivel']);
    expect(redactInaccessibleAccountId('acc-visivel', visible)).toBe('acc-visivel');
    expect(redactInaccessibleAccountId('acc-secreta', visible)).toBeNull();
    expect(redactInaccessibleAccountId(null, visible)).toBeNull();
  });
});

describe('resolveRestrictMemberIds', () => {
  it('inclui o autor mesmo se a lista omitir', () => {
    expect(resolveRestrictMemberIds(['mem-a'], 'mem-autor')).toEqual(['mem-a', 'mem-autor']);
  });

  it('não duplica o autor se ele já estiver na lista', () => {
    expect(resolveRestrictMemberIds(['mem-autor', 'mem-a'], 'mem-autor')).toEqual(['mem-autor', 'mem-a']);
  });
});

describe('restrictAccountSchema', () => {
  it('rejeita lista vazia', () => {
    expect(restrictAccountSchema.safeParse({ householdMemberIds: [] }).success).toBe(false);
  });

  it('aceita ao menos um membership id', () => {
    const parsed = restrictAccountSchema.safeParse({
      householdMemberIds: ['11111111-1111-4111-8111-111111111111'],
    });
    expect(parsed.success).toBe(true);
  });
});

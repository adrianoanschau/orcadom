import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { CategoriesService } from './categories.service.js';

interface Row {
  id: string;
  householdId: string;
  name: string;
  type: 'INCOME' | 'EXPENSE';
  icon: string | null;
  color: string | null;
  parentId: string | null;
  isSystem: boolean;
}

function serviceFor(initial: Row[], options?: { transactions?: number; failUnique?: boolean }) {
  const rows = initial.map((row) => ({ ...row }));
  let created: Row | null = null;
  let updated: Partial<Row> | null = null;
  const prisma = {
    client: {
      category: {
        findMany: () => rows,
        findFirst: ({ where }: { where: { id: string; householdId: string } }) =>
          rows.find((row) => row.id === where.id && row.householdId === where.householdId) ?? null,
        create: ({ data }: { data: Omit<Row, 'id'> & { id?: string } }) => {
          if (options?.failUnique) {
            const error = new Error('unique');
            Object.assign(error, { code: 'P2002' });
            throw error;
          }
          created = {
            id: 'created',
            icon: data.icon ?? null,
            color: data.color ?? null,
            parentId: data.parentId ?? null,
            isSystem: data.isSystem,
            householdId: data.householdId,
            name: data.name,
            type: data.type,
          };
          rows.push(created);
          return created;
        },
        update: ({ data }: { data: Partial<Row> }) => {
          updated = data;
          return { ...rows[0], ...data };
        },
        delete: () => undefined,
        count: ({ where }: { where: { parentId?: string } }) =>
          rows.filter((row) => row.parentId === where.parentId).length,
      },
      transaction: { count: () => options?.transactions ?? 0 },
      installmentPlan: { count: () => 0 },
      recurringTransaction: { count: () => 0 },
      budget: { count: () => 0 },
    },
  };
  return {
    service: new CategoriesService(prisma as never),
    created: () => created,
    updated: () => updated,
  };
}

const system: Row = {
  id: 'sys',
  householdId: 'hh',
  name: 'Mercado',
  type: 'EXPENSE',
  icon: null,
  color: '#7A8B2E',
  parentId: null,
  isSystem: true,
};

const mine: Row = {
  id: 'mine',
  householdId: 'hh',
  name: 'Feira',
  type: 'EXPENSE',
  icon: null,
  color: '#111111',
  parentId: null,
  isSystem: false,
};

describe('CategoriesService', () => {
  it('cria filha de categoria do sistema sem marcá-la como sistema', async () => {
    const harness = serviceFor([system]);
    const created = await harness.service.create('hh', {
      name: 'Hortifruti',
      type: 'EXPENSE',
      parentId: 'sys',
    });
    expect(created.isSystem).toBe(false);
    expect(created.parentId).toBe('sys');
    expect(created.depth).toBe(2);
  });

  it('permite mover categoria do usuário para dentro de uma do sistema', async () => {
    const harness = serviceFor([system, mine]);
    await harness.service.update('hh', 'mine', { parentId: 'sys' });
    expect(harness.updated()).toMatchObject({ parentId: 'sys' });
  });

  it('bloqueia alterar e excluir categoria do sistema', async () => {
    const harness = serviceFor([system]);
    await expect(harness.service.update('hh', 'sys', { name: 'Feira' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(harness.service.update('hh', 'sys', { parentId: 'mine' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(harness.service.remove('hh', 'sys')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bloqueia tipo diferente, ciclo, profundidade e pai de outro household', async () => {
    const deep: Row[] = [
      system,
      { ...mine, id: 'mid', name: 'A', parentId: 'sys' },
      { ...mine, id: 'leaf', name: 'B', parentId: 'mid' },
    ];
    const harness = serviceFor(deep);
    await expect(
      harness.service.create('hh', { name: 'Renda', type: 'INCOME', parentId: 'sys' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(harness.service.update('hh', 'sys', { parentId: 'leaf' })).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(harness.service.update('hh', 'mid', { parentId: 'leaf' })).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(
      harness.service.create('hh', { name: 'C', type: 'EXPENSE', parentId: 'leaf' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      harness.service.create('hh', { name: 'D', type: 'EXPENSE', parentId: 'fora' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('bloqueia exclusão com filhas ou em uso', async () => {
    const child: Row = { ...mine, id: 'child', name: 'Hortifruti', parentId: 'mine' };
    const withChild = serviceFor([mine, child]);
    await expect(withChild.service.remove('hh', 'mine')).rejects.toBeInstanceOf(ConflictException);
    const inUse = serviceFor([mine], { transactions: 1 });
    await expect(inUse.service.remove('hh', 'mine')).rejects.toBeInstanceOf(ConflictException);
  });

  it('traduz nome duplicado', async () => {
    const harness = serviceFor([system], { failUnique: true });
    await expect(
      harness.service.create('hh', { name: 'Mercado', type: 'EXPENSE' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

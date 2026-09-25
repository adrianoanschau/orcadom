import { describe, expect, it } from 'vitest';
import {
  captureAuditWrite,
  formatAuditChanges,
  formatAuditHeadline,
  runWithActor,
  sanitize,
} from '@orcadom/database';

describe('sanitize', () => {
  it('remove campos sensíveis e serializa decimal', () => {
    const result = sanitize({
      id: 'acc-1',
      name: 'Nubank',
      passwordHash: 'secret',
      token: 'abc',
      amount: { toFixed: (digits: number) => (12.3).toFixed(digits) },
    });
    expect(result).toMatchObject({ id: 'acc-1', name: 'Nubank', amount: '12.30' });
    expect(result).not.toHaveProperty('passwordHash');
    expect(result).not.toHaveProperty('token');
  });
});

describe('formatAuditHeadline', () => {
  it('nomeia o ator humano e os jobs', () => {
    expect(
      formatAuditHeadline({ action: 'UPDATE', source: 'USER', actorName: 'Ana' }),
    ).toBe('Editado por Ana');
    expect(
      formatAuditHeadline({ action: 'CREATE', source: 'USER', actorName: null }),
    ).toBe('Criado por um membro');
    expect(
      formatAuditHeadline({ action: 'CREATE', source: 'CRON_RECURRING', actorName: null }),
    ).toBe('Criado pelo job de recorrência');
    expect(
      formatAuditHeadline({ action: 'UPDATE', source: 'CRON_INSTALLMENT', actorName: 'Ana' }),
    ).toBe('Editado pelo job de parcelas');
  });
});

describe('formatAuditChanges', () => {
  it('descreve o diff de um lançamento', () => {
    const changes = formatAuditChanges(
      'UPDATE',
      { amount: '50.00', description: 'Mercado' },
      { amount: '80.00', description: 'Mercado' },
    );
    expect(changes).toEqual(['valor: R$ 50,00 → R$ 80,00']);
    expect(
      formatAuditChanges(
        'CREATE',
        null,
        { description: 'Padaria', amount: '10.00' },
        { importBatchId: 'batch-1' },
      ),
    ).toEqual(['descrição: Padaria', 'valor: R$ 10,00', 'via importação de extrato']);
  });
});

describe('captureAuditWrite', () => {
  it('captura create mesmo quando a escrita está dentro de uma transação', async () => {
    const logs: Record<string, unknown>[] = [];
    await runWithActor({ userId: 'user-1', householdId: 'house-1', source: 'USER' }, async () => {
      await captureAuditWrite({
        model: 'Transaction',
        operation: 'create',
        args: {},
        query: () =>
          Promise.resolve({
            id: 'tx-1',
            householdId: 'house-1',
            amount: { toFixed: () => '10.00' },
            description: 'Padaria',
          }),
        loadBefore: () => Promise.resolve(null),
        writeLog: (data) => {
          logs.push(data);
          return Promise.resolve();
        },
      });
    });

    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      entityType: 'Transaction',
      entityId: 'tx-1',
      action: 'CREATE',
      source: 'USER',
      actorUserId: 'user-1',
      householdId: 'house-1',
    });
  });

  it('carrega o before em update e não atribui ator em job de cron', async () => {
    const logs: Record<string, unknown>[] = [];
    await runWithActor({ userId: null, householdId: 'house-1', source: 'CRON_INSTALLMENT' }, async () => {
      await captureAuditWrite({
        model: 'Transaction',
        operation: 'update',
        args: { where: { id: 'tx-1' } },
        query: () =>
          Promise.resolve({
            id: 'tx-1',
            householdId: 'house-1',
            postingStatus: 'POSTED',
          }),
        loadBefore: () =>
          Promise.resolve({
            id: 'tx-1',
            householdId: 'house-1',
            postingStatus: 'SCHEDULED',
          }),
        writeLog: (data) => {
          logs.push(data);
          return Promise.resolve();
        },
      });
    });

    expect(logs[0]).toMatchObject({
      action: 'UPDATE',
      source: 'CRON_INSTALLMENT',
      actorUserId: null,
      householdId: 'house-1',
    });
    expect(logs[0]?.before).toMatchObject({ postingStatus: 'SCHEDULED' });
  });
});

import { notificationPath } from '@orcadom/types';
import { describe, expect, it } from 'vitest';
import {
  budgetNotificationCopy,
  emailImportNotificationCopy,
  formatMonthLabel,
  reportReadyCopy,
  savingsGoalCompletedCopy,
  wantsEmail,
  wantsWebPush,
} from './notification-policy.js';

describe('wantsEmail', () => {
  it('manda email só quando o tipo exige ação ou já estourou', () => {
    expect(wantsEmail('BUDGET_WARNING')).toBe(false);
    expect(wantsEmail('EMAIL_IMPORT_READY')).toBe(false);
    expect(wantsEmail('BUDGET_EXCEEDED')).toBe(true);
    expect(wantsEmail('EMAIL_IMPORT_UNMAPPED_ACCOUNT')).toBe(true);
    expect(wantsEmail('SAVINGS_GOAL_COMPLETED')).toBe(false);
    expect(wantsEmail('REPORT_READY')).toBe(false);
  });
});

describe('wantsWebPush', () => {
  it('reaproveita a política dos tipos que já saem do app', () => {
    expect(wantsWebPush('BUDGET_WARNING')).toBe(false);
    expect(wantsWebPush('EMAIL_IMPORT_READY')).toBe(false);
    expect(wantsWebPush('BUDGET_EXCEEDED')).toBe(true);
    expect(wantsWebPush('EMAIL_IMPORT_UNMAPPED_ACCOUNT')).toBe(true);
    expect(wantsWebPush('SAVINGS_GOAL_COMPLETED')).toBe(false);
    expect(wantsWebPush('REPORT_READY')).toBe(false);
  });
});

describe('notificationPath', () => {
  it('resolve o destino pelo tipo e metadata', () => {
    expect(notificationPath('BUDGET_EXCEEDED')).toBe('/budgets');
    expect(notificationPath('EMAIL_IMPORT_READY', { importBatchId: 'batch-1' })).toBe(
      '/imports?batchId=batch-1',
    );
    expect(notificationPath('SAVINGS_GOAL_COMPLETED', { goalId: 'goal-1' })).toBe(
      '/savings-goals/goal-1',
    );
    expect(notificationPath('REPORT_READY', { reportId: 'report-1' })).toBe(
      '/transactions?reportId=report-1',
    );
  });
});

describe('reportReadyCopy', () => {
  it('monta título e mensagem com o formato', () => {
    expect(reportReadyCopy('XLSX')).toEqual({
      type: 'REPORT_READY',
      title: 'Relatório pronto',
      message: 'Seu extrato em Excel está pronto para download.',
    });
  });
});

describe('savingsGoalCompletedCopy', () => {
  it('monta título e mensagem com o nome e o valor', () => {
    expect(savingsGoalCompletedCopy('Viagem', '5000.00')).toEqual({
      type: 'SAVINGS_GOAL_COMPLETED',
      title: 'Meta de economia concluída',
      message: 'A meta Viagem (R$ 5.000,00) foi atingida.',
    });
  });
});

describe('budgetNotificationCopy', () => {
  it('monta título e mensagem com a categoria e o mês', () => {
    expect(budgetNotificationCopy('warning', 'Mercado', '2026-09')).toEqual({
      type: 'BUDGET_WARNING',
      title: 'Orçamento perto do limite',
      message: 'Você já usou 80% do orçamento de Mercado em setembro de 2026.',
    });
    expect(budgetNotificationCopy('exceeded', 'Mercado', '2026-09').type).toBe('BUDGET_EXCEEDED');
  });
});

describe('emailImportNotificationCopy', () => {
  it('separa extrato pronto de conta não mapeada', () => {
    expect(emailImportNotificationCopy('nubank.ofx', false).type).toBe('EMAIL_IMPORT_READY');
    expect(emailImportNotificationCopy('nubank.ofx', true).type).toBe(
      'EMAIL_IMPORT_UNMAPPED_ACCOUNT',
    );
  });
});

describe('formatMonthLabel', () => {
  it('formata o mês em português', () => {
    expect(formatMonthLabel('2026-09')).toBe('setembro de 2026');
  });
});

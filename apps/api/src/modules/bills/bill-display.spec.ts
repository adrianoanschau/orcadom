import { describe, expect, it } from 'vitest';
import { todayKeyInSaoPaulo } from '../../common/calendar.js';
import { billDisplay } from './bill-display.js';

describe('estado da conta a pagar', () => {
  const today = '2026-10-10';

  it('às 22h em Brasília o dia ainda é hoje, e a conta que vence hoje não está atrasada', () => {
    const night = new Date('2026-10-11T01:00:00.000Z');
    expect(todayKeyInSaoPaulo(night)).toBe('2026-10-10');
    expect(billDisplay('PENDING', '2026-10-10', todayKeyInSaoPaulo(night)).label).toBe('Vence hoje');
  });

  it('deriva atrasada, vence em breve e a pagar sem gravar esses status', () => {
    expect(billDisplay('PENDING', '2026-10-07', today)).toMatchObject({
      label: 'Atrasada',
      tone: 'expense',
      daysUntilDue: -3,
    });
    expect(billDisplay('PENDING', '2026-10-11', today).label).toBe('Vence amanhã');
    expect(billDisplay('PENDING', '2026-10-13', today).label).toBe('Vence em 3 dias');
    expect(billDisplay('PENDING', '2026-10-14', today)).toMatchObject({ label: 'A pagar', tone: 'neutral' });
    expect(billDisplay('PAID', '2026-10-01', today).tone).toBe('income');
    expect(billDisplay('CANCELED', '2026-10-01', today).label).toBe('Cancelada');
  });
});

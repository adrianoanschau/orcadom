import { BILL_DUE_SOON_DAYS, daysBetween } from '../../common/calendar.js';

export type BillStoredStatus = 'PENDING' | 'PAID' | 'CANCELED';
export type BillDisplayTone = 'neutral' | 'brand' | 'income' | 'expense' | 'pending';

export interface BillDisplay {
  label: string;
  tone: BillDisplayTone;
  daysUntilDue: number;
}

export function billDisplay(
  status: BillStoredStatus,
  dueKey: string,
  todayKey: string,
): BillDisplay {
  const daysUntilDue = daysBetween(todayKey, dueKey);
  if (status === 'PAID') return { label: 'Paga', tone: 'income', daysUntilDue };
  if (status === 'CANCELED') return { label: 'Cancelada', tone: 'neutral', daysUntilDue };
  if (daysUntilDue < 0) return { label: 'Atrasada', tone: 'expense', daysUntilDue };
  if (daysUntilDue === 0) return { label: 'Vence hoje', tone: 'pending', daysUntilDue };
  if (daysUntilDue === 1) return { label: 'Vence amanhã', tone: 'pending', daysUntilDue };
  if (daysUntilDue <= BILL_DUE_SOON_DAYS) {
    return { label: `Vence em ${String(daysUntilDue)} dias`, tone: 'pending', daysUntilDue };
  }
  return { label: 'A pagar', tone: 'neutral', daysUntilDue };
}

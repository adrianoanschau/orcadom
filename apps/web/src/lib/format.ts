export function formatMoney(value: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  );
}

export function formatDateTime(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(iso),
  );
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(iso),
  );
}

export function formatRelativeTime(iso: string) {
  const deltaSeconds = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  const formatter = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' });
  const abs = Math.abs(deltaSeconds);
  if (abs < 60) return formatter.format(-deltaSeconds, 'second');
  const minutes = Math.round(deltaSeconds / 60);
  if (Math.abs(minutes) < 60) return formatter.format(-minutes, 'minute');
  const hours = Math.round(deltaSeconds / 3600);
  if (Math.abs(hours) < 24) return formatter.format(-hours, 'hour');
  const days = Math.round(deltaSeconds / 86400);
  if (Math.abs(days) < 30) return formatter.format(-days, 'day');
  return formatDate(iso);
}

export function todayInput() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${String(now.getFullYear())}-${month}-${day}`;
}

export function currentMonth() {
  return todayInput().slice(0, 7);
}

export function daysUntil(iso: string, now = new Date()): number {
  const target = new Date(iso);
  const start = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const end = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((end - start) / 86_400_000);
}

export function daysUntilLabel(iso: string): string {
  const days = daysUntil(iso);
  if (days > 1) return `faltam ${String(days)} dias`;
  if (days === 1) return 'falta 1 dia';
  if (days === 0) return 'vence hoje';
  if (days === -1) return 'prazo venceu ontem';
  return `prazo vencido há ${String(Math.abs(days))} dias`;
}

export function dateToNoonIso(value: string) {
  return `${value}T12:00:00.000Z`;
}

export function humanize(message: string) {
  if (message.includes('>=8')) return 'Use pelo menos 8 caracteres.';
  if (message.includes('>=1') || message.startsWith('Too small')) return 'Preencha este campo.';
  if (message.startsWith('Too big')) return 'Texto longo demais.';
  if (message.toLowerCase().includes('email')) return 'Informe um e-mail válido.';
  if (message.startsWith('Invalid')) return 'Valor inválido.';
  return message;
}

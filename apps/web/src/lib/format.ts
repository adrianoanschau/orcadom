export function formatMoney(value: string) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number(value),
  );
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(iso),
  );
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

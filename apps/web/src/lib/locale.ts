import { localePreferenceSchema, type LocalePreference } from '@orcadom/types';

export const LOCALE_STORAGE_KEY = 'orcadom.locale';
export const DEFAULT_LOCALE_PREFERENCE: LocalePreference = 'pt-BR';

export const localeOptions: { value: LocalePreference; label: string; hint: string }[] = [
  {
    value: 'pt-BR',
    label: 'Português (Brasil)',
    hint: 'Datas e calendário em português, no formato brasileiro.',
  },
  {
    value: 'en-US',
    label: 'Inglês (Estados Unidos)',
    hint: 'Datas e calendário em inglês, no formato americano.',
  },
  {
    value: 'system',
    label: 'Seguir o sistema',
    hint: 'Usa o idioma configurado no navegador ou no sistema operacional.',
  },
];

let currentLocale = 'pt-BR';

export function getAppLocale(): string {
  return currentLocale;
}

export function setAppLocale(locale: string): void {
  currentLocale = locale;
}

export function parseLocalePreference(value: string | null | undefined): LocalePreference {
  const parsed = localePreferenceSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_LOCALE_PREFERENCE;
}

export function readStoredLocale(): LocalePreference {
  if (typeof window === 'undefined') return DEFAULT_LOCALE_PREFERENCE;
  return parseLocalePreference(window.localStorage.getItem(LOCALE_STORAGE_KEY));
}

export function storeLocale(preference: LocalePreference): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(LOCALE_STORAGE_KEY, preference);
}

export function resolveLocale(preference: LocalePreference): string {
  if (preference !== 'system') return preference;
  const language = typeof navigator === 'undefined' ? 'pt-BR' : navigator.language;
  return language.toLowerCase().startsWith('pt') ? 'pt-BR' : 'en-US';
}

export function weekStartsOn(locale: string): 0 | 1 {
  try {
    const firstDay = (new Intl.Locale(locale) as Intl.Locale & { weekInfo?: { firstDay: number } })
      .weekInfo?.firstDay;
    if (firstDay === 7) return 0;
    if (firstDay === 1) return 1;
  } catch {
    // Intl.Locale.weekInfo ainda não está em todos os engines.
  }
  return locale.toLowerCase().startsWith('en') ? 0 : 1;
}

export function formatInputDate(value: string, locale = getAppLocale()): string {
  const parts = value.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  const day = parts[2];
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
    new Date(year, month - 1, day),
  );
}

export function formatInputMonth(value: string, locale = getAppLocale()): string {
  const parts = value.split('-').map(Number);
  const year = parts[0];
  const month = parts[1];
  if (!year || !month) return value;
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  );
}

export function weekdayLabels(locale: string, weekStart: 0 | 1): string[] {
  const monday = new Date(Date.UTC(2024, 0, 1));
  const labels = Array.from({ length: 7 }, (_, index) =>
    new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
      new Date(monday.getTime() + index * 86_400_000),
    ),
  );
  return weekStart === 0 ? [labels[6] ?? '', ...labels.slice(0, 6)] : labels;
}

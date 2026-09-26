'use client';

import { useQuery } from '@tanstack/react-query';
import { usePathname } from 'next/navigation';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { LocalePreference } from '@orcadom/types';
import { api } from '@/lib/api';
import {
  DEFAULT_LOCALE_PREFERENCE,
  parseLocalePreference,
  readStoredLocale,
  resolveLocale,
  setAppLocale,
  storeLocale,
} from '@/lib/locale';
import type { PublicUser } from '@/lib/models';

interface LocaleContextValue {
  preference: LocalePreference;
  locale: string;
  setPreference: (preference: LocalePreference) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/register';
  const [preference, setPreferenceState] = useState<LocalePreference>(DEFAULT_LOCALE_PREFERENCE);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<PublicUser>('/auth/me'),
    enabled: !isAuthPage,
    retry: false,
  });

  useEffect(() => {
    setPreferenceState(readStoredLocale());
  }, []);

  useEffect(() => {
    if (me.data?.locale) {
      const next = parseLocalePreference(me.data.locale);
      setPreferenceState(next);
      storeLocale(next);
    }
  }, [me.data?.locale]);

  const locale = resolveLocale(preference);

  useEffect(() => {
    setAppLocale(locale);
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(
    () => ({
      preference,
      locale,
      setPreference: (next) => {
        setPreferenceState(next);
        storeLocale(next);
        setAppLocale(resolveLocale(next));
        document.documentElement.lang = resolveLocale(next);
      },
    }),
    [preference, locale],
  );

  return (
    <LocaleContext.Provider value={value}>
      <LocaleBridge>{children}</LocaleBridge>
    </LocaleContext.Provider>
  );
}

function LocaleBridge({ children }: { children: ReactNode }) {
  useLocale();
  return children;
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) {
    throw new Error('useLocale deve ser usado dentro de LocaleProvider.');
  }
  return context;
}

'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, getActiveHouseholdId, setActiveHouseholdId } from '@/lib/api';
import type { HouseholdMembership } from '@/lib/models';

interface HouseholdContextValue {
  households: HouseholdMembership[];
  household: HouseholdMembership | null;
  setHouseholdId: (id: string) => void;
  isLoading: boolean;
}

const HouseholdContext = createContext<HouseholdContextValue | null>(null);

export function HouseholdProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['households'],
    queryFn: () => api<HouseholdMembership[]>('/households'),
  });

  const households = query.data ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(() => getActiveHouseholdId());
  const household =
    households.find((item) => item.id === selectedId) ?? households[0] ?? null;

  useEffect(() => {
    if (household && household.id !== selectedId) {
      setSelectedId(household.id);
      setActiveHouseholdId(household.id);
    }
  }, [household, selectedId]);

  const value = useMemo<HouseholdContextValue>(
    () => ({
      households,
      household,
      isLoading: query.isLoading,
      setHouseholdId: (id: string) => {
        setSelectedId(id);
        setActiveHouseholdId(id);
        void queryClient.invalidateQueries({
          predicate: (item) => item.queryKey[0] !== 'households',
        });
      },
    }),
    [household, households, query.isLoading, queryClient],
  );

  if (query.isLoading) {
    return <p className="px-4 py-8 text-sm text-ink-soft">Carregando espaço…</p>;
  }

  return <HouseholdContext.Provider value={value}>{children}</HouseholdContext.Provider>;
}

export function useHousehold(): HouseholdContextValue {
  const context = useContext(HouseholdContext);
  if (!context) {
    throw new Error('useHousehold precisa estar dentro de HouseholdProvider');
  }
  return context;
}

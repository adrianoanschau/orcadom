'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function MeuPluggySettingsLink() {
  const status = useQuery({
    queryKey: ['meupluggy-status'],
    queryFn: () => api<{ configured: boolean }>('/open-finance/meupluggy/status'),
    retry: false,
  });
  if (!status.isSuccess) return null;
  return (
    <li>
      <Link href="/settings/meupluggy" className="block px-5 py-4 hover:bg-surface-sunken">
        <p className="text-sm font-medium text-ink">Meu Pluggy</p>
        <p className="mt-1 text-sm text-ink-soft">
          Conexão pessoal com os seus bancos. Não faz parte do produto comercial.
        </p>
      </Link>
    </li>
  );
}

'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { LocaleProvider } from './locale-provider';
import { PwaProvider } from './pwa-provider';

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: false,
            refetchOnWindowFocus: false,
            // Roda mesmo offline para o service worker devolver o cache da API.
            networkMode: 'offlineFirst',
          },
          // Não pausa mutação para reenviar depois: escrita offline fica fora deste fluxo.
          mutations: { networkMode: 'always' },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <LocaleProvider>
        <PwaProvider>{children}</PwaProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}

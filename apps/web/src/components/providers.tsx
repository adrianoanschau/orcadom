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
          queries: { retry: false, refetchOnWindowFocus: false },
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

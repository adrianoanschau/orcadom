'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import type { AppNotification } from '@/lib/models';
import { Button } from './ui';

const links = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/accounts', label: 'Contas' },
  { href: '/categories', label: 'Categorias' },
  { href: '/transactions', label: 'Lançamentos' },
  { href: '/budgets', label: 'Orçamentos' },
  { href: '/imports', label: 'Importar' },
  { href: '/settings/import-alias', label: 'Email' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<AppNotification[]>('/notifications'),
    refetchInterval: 30_000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <Link href="/dashboard" className="font-display text-[21px] font-medium text-brand">
            Orcadom
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1" aria-label="Principal">
            {links.map((link) => {
              const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={active ? 'page' : undefined}
                  className={`rounded-pill px-3 py-1.5 text-sm ${active ? 'bg-brand-tint text-brand' : 'text-ink-soft hover:bg-surface-sunken'}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </nav>
          <Button
            variant="ghost"
            onClick={() => {
              void api('/auth/logout', { method: 'POST' }).finally(() => {
                queryClient.clear();
                window.location.assign('/login');
              });
            }}
          >
            Sair
          </Button>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8">
        {(notifications.data ?? []).length > 0 ? (
          <div className="mb-6 space-y-2">
            {notifications.data?.map((item) => (
              <div
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-brand-tint px-4 py-3"
              >
                <div>
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="text-sm text-ink-soft">{item.body}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {item.importBatchId ? (
                    <Link href={`/imports?batchId=${item.importBatchId}`} className="text-sm text-brand">
                      Revisar
                    </Link>
                  ) : null}
                  <Button
                    variant="ghost"
                    onClick={() => {
                      markRead.mutate(item.id);
                    }}
                  >
                    Ok
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}

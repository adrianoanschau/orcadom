'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { api } from '@/lib/api';
import { Button } from './ui';

const links = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/accounts', label: 'Contas' },
  { href: '/categories', label: 'Categorias' },
  { href: '/transactions', label: 'Lançamentos' },
  { href: '/imports', label: 'Importar' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();

  return (
    <div className="min-h-screen">
      <header className="border-b border-hairline bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-4">
          <Link href="/dashboard" className="font-display text-[21px] font-medium text-brand">
            Orcadom
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1" aria-label="Principal">
            {links.map((link) => {
              const active = pathname === link.href;
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
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </div>
  );
}

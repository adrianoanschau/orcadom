'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { api, setActiveHouseholdId } from '@/lib/api';
import { useHousehold } from './household-provider';
import { NotificationBell } from './notification-bell';
import { Button, Select } from './ui';

const links = [
  { href: '/dashboard', label: 'Painel' },
  { href: '/accounts', label: 'Contas' },
  { href: '/categories', label: 'Categorias' },
  { href: '/transactions', label: 'Lançamentos' },
  { href: '/budgets', label: 'Orçamentos' },
  { href: '/installments', label: 'Parcelas' },
  { href: '/recurring', label: 'Recorrentes' },
  { href: '/imports', label: 'Importar' },
  { href: '/settings/import-alias', label: 'Email' },
  { href: '/settings/household', label: 'Família' },
  { href: '/settings/activity', label: 'Atividade' },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const { households, household, setHouseholdId } = useHousehold();

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
          {households.length > 1 ? (
            <Select
              aria-label="Espaço ativo"
              className="w-auto min-w-[10rem]"
              value={household?.id ?? ''}
              onChange={(event) => {
                setHouseholdId(event.target.value);
              }}
            >
              {households.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </Select>
          ) : household ? (
            <span className="text-sm text-ink-soft">{household.name}</span>
          ) : null}
          <NotificationBell />
          <Button
            variant="ghost"
            onClick={() => {
              void api('/auth/logout', { method: 'POST' }).finally(() => {
                setActiveHouseholdId(null);
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

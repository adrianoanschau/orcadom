'use client';

import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { api, setActiveHouseholdId } from '@/lib/api';
import { useHousehold } from './household-provider';
import { CloseIcon, HomeIcon, ImportIcon, LedgerIcon, MoreIcon } from './icons';
import { isMoreActive, isNavActive, moreNav, primaryNav } from './nav';
import { NotificationBell } from './notification-bell';
import { Button, Select } from './ui';

const tabIcons = {
  '/dashboard': HomeIcon,
  '/transactions': LedgerIcon,
  '/imports': ImportIcon,
} as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-screen lg:flex">
      <DesktopSidebar />
      <div className="flex min-h-screen min-w-0 flex-1 flex-col lg:pl-64">
        <MobileHeader />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 pb-28 lg:px-8 lg:py-8 lg:pb-8">
          {children}
        </main>
        <MobileTabBar
          moreOpen={moreOpen}
          onMore={() => {
            setMoreOpen(true);
          }}
        />
        <MoreSheet
          open={moreOpen}
          onClose={() => {
            setMoreOpen(false);
          }}
        />
      </div>
    </div>
  );
}

function DesktopSidebar() {
  const pathname = usePathname();
  return (
    <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 flex-col border-r border-hairline bg-surface lg:flex">
      <div className="border-b border-hairline px-5 py-5">
        <Link href="/dashboard" className="font-display text-h2 font-medium text-brand">
          Orcadom
        </Link>
        <div className="mt-4">
          <HouseholdSwitcher />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Principal">
        <p className="px-2 pb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
          Dia a dia
        </p>
        <div className="space-y-1">
          {primaryNav.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              active={isNavActive(pathname, item.href)}
            />
          ))}
        </div>
        {moreNav.map((group) => (
          <div key={group.title} className="mt-6">
            <p className="px-2 pb-2 text-xs font-medium tracking-wide text-ink-faint uppercase">
              {group.title}
            </p>
            <div className="space-y-1">
              {group.items.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  active={isNavActive(pathname, item.href)}
                />
              ))}
            </div>
          </div>
        ))}
      </nav>
      <div className="flex items-center justify-between gap-2 border-t border-hairline px-3 py-3">
        <NotificationBell />
        <LogoutButton />
      </div>
    </aside>
  );
}

function MobileHeader() {
  return (
    <header className="sticky top-0 z-20 border-b border-hairline bg-surface pt-[env(safe-area-inset-top)] lg:hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link
          href="/dashboard"
          className="min-w-0 flex-1 font-display text-h2 font-medium text-brand"
        >
          Orcadom
        </Link>
        <HouseholdSwitcher compact />
        <NotificationBell />
      </div>
    </header>
  );
}

function MobileTabBar({ moreOpen, onMore }: { moreOpen: boolean; onMore: () => void }) {
  const pathname = usePathname();
  const moreActive = isMoreActive(pathname) || moreOpen;

  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-hairline bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="grid grid-cols-4">
        {primaryNav.map((item) => {
          const Icon = tabIcons[item.href as keyof typeof tabIcons];
          const active = isNavActive(pathname, item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-14 flex-col items-center justify-center gap-1 text-xs ${active ? 'text-brand' : 'text-ink-soft'}`}
              >
                <Icon />
                {item.label}
              </Link>
            </li>
          );
        })}
        <li>
          <button
            type="button"
            aria-expanded={moreOpen}
            className={`flex min-h-14 w-full flex-col items-center justify-center gap-1 text-xs ${moreActive ? 'text-brand' : 'text-ink-soft'}`}
            onClick={onMore}
          >
            <MoreIcon />
            Mais
          </button>
        </li>
      </ul>
    </nav>
  );
}

function MoreSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const pathname = usePathname();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="fixed inset-x-0 bottom-0 z-40 m-0 mt-auto max-h-[85dvh] w-full max-w-none overflow-y-auto rounded-t-lg border-0 bg-surface p-5 text-ink backdrop:bg-ink/40 lg:hidden"
      onClose={() => {
        if (open) onClose();
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id={titleId} className="font-display text-h2 font-medium">
          Mais
        </h2>
        <button
          type="button"
          className="inline-flex size-11 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken"
          aria-label="Fechar"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>
      {moreNav.map((group) => (
        <div key={group.title} className="mt-5">
          <p className="text-xs font-medium tracking-wide text-ink-faint uppercase">
            {group.title}
          </p>
          <ul className="mt-2 divide-y divide-hairline rounded-md bg-surface-sunken/60">
            {group.items.map((item) => {
              const active = isNavActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={`block px-4 py-3 text-sm ${active ? 'font-medium text-brand' : 'text-ink'}`}
                    onClick={onClose}
                  >
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="mt-6">
        <LogoutButton />
      </div>
    </dialog>
  );
}

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={`block rounded-md px-3 py-2 text-sm ${active ? 'bg-brand-tint text-brand' : 'text-ink-soft hover:bg-surface-sunken'}`}
    >
      {label}
    </Link>
  );
}

function HouseholdSwitcher({ compact = false }: { compact?: boolean }) {
  const { households, household, setHouseholdId } = useHousehold();

  if (households.length > 1) {
    return (
      <Select
        aria-label="Espaço ativo"
        className={compact ? 'min-w-0 max-w-[9.5rem]' : 'w-full'}
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
    );
  }

  if (household) {
    return (
      <span className={`truncate text-sm text-ink-soft ${compact ? 'max-w-[8rem]' : ''}`}>
        {household.name}
      </span>
    );
  }

  return null;
}

function LogoutButton() {
  const queryClient = useQueryClient();
  return (
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
  );
}

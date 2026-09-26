'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import { api, setActiveHouseholdId } from '@/lib/api';
import type { PublicUser } from '@/lib/models';
import { Avatar } from './avatar';
import { ChevronIcon } from './icons';

const menuItems = [
  { href: '/profile', label: 'Ver perfil' },
  { href: '/settings', label: 'Configurações' },
] as const;

export function UserMenu({
  variant = 'sidebar',
  onNavigate,
}: {
  variant?: 'sidebar' | 'sheet';
  onNavigate?: () => void;
}) {
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<PublicUser>('/auth/me'),
  });
  const user = me.data;
  const name = user?.name ?? 'Conta';

  function logout() {
    void api('/auth/logout', { method: 'POST' }).finally(() => {
      setActiveHouseholdId(null);
      queryClient.clear();
      window.location.assign('/login');
    });
  }

  if (variant === 'sheet') {
    return (
      <div>
        <div className="flex items-center gap-3 rounded-md bg-surface-sunken/60 px-4 py-3">
          <Avatar name={name} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-ink">{name}</p>
            {user?.email ? <p className="truncate text-xs text-ink-soft">{user.email}</p> : null}
          </div>
        </div>
        <ul className="mt-2 divide-y divide-hairline rounded-md bg-surface-sunken/60">
          {menuItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className={`block px-4 py-3 text-sm ${pathname === item.href || pathname.startsWith(`${item.href}/`) ? 'font-medium text-brand' : 'text-ink'}`}
                onClick={onNavigate}
              >
                {item.label}
              </Link>
            </li>
          ))}
          <li>
            <button
              type="button"
              className="block w-full px-4 py-3 text-left text-sm text-ink"
              onClick={logout}
            >
              Sair
            </button>
          </li>
        </ul>
      </div>
    );
  }

  return <SidebarUserMenu name={name} email={user?.email} pathname={pathname} onLogout={logout} />;
}

function SidebarUserMenu({
  name,
  email,
  pathname,
  onLogout,
}: {
  name: string;
  email?: string;
  pathname: string;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative px-2 py-2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="menu"
        className="flex w-full min-h-11 items-center gap-3 rounded-md px-2 py-2 text-left hover:bg-surface-sunken"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <Avatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink">{name}</span>
          {email ? <span className="block truncate text-xs text-ink-soft">{email}</span> : null}
        </span>
        <span className={`text-ink-soft transition ${open ? 'rotate-180' : ''}`}>
          <ChevronIcon />
        </span>
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute inset-x-2 bottom-full z-30 mb-1 overflow-hidden rounded-md border border-hairline bg-surface py-1 shadow-sm"
        >
          {menuItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              role="menuitem"
              className="block px-3 py-2 text-sm text-ink hover:bg-surface-sunken"
            >
              {item.label}
            </Link>
          ))}
          <button
            type="button"
            role="menuitem"
            className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-surface-sunken"
            onClick={onLogout}
          >
            Sair
          </button>
        </div>
      ) : null}
    </div>
  );
}

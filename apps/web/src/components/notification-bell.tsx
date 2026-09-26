'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { formatRelativeTime } from '@/lib/format';
import type { AppNotification } from '@/lib/models';
import { Button } from './ui';

export function NotificationBell() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const notifications = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api<AppNotification[]>('/notifications?unread=true&limit=20'),
    refetchInterval: 30_000,
  });
  const items = notifications.data ?? [];
  const unread = items.length;

  const markRead = useMutation({
    mutationFn: (id: string) => api(`/notifications/${id}/read`, { method: 'PATCH' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
  const markAll = useMutation({
    mutationFn: () => api('/notifications/read-all', { method: 'PATCH' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

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
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-label={unread > 0 ? `Notificações, ${String(unread)} não lidas` : 'Notificações'}
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="true"
        className="relative inline-flex size-11 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken"
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        <BellIcon />
        {unread > 0 ? (
          <span className="absolute top-1 right-1 min-w-4 rounded-pill bg-brand px-1 text-center text-xs font-medium text-white">
            {unread > 9 ? '9+' : String(unread)}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute right-0 z-30 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-lg border border-hairline bg-surface p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-display text-h2 font-medium">Notificações</p>
            {unread > 0 ? (
              <Button
                variant="ghost"
                disabled={markAll.isPending}
                onClick={() => {
                  markAll.mutate();
                }}
              >
                Marcar todas como lidas
              </Button>
            ) : null}
          </div>
          {unread === 0 ? (
            <p className="mt-3 text-sm text-ink-soft">Nenhuma notificação nova.</p>
          ) : (
            <ul className="mt-3 max-h-80 space-y-2 overflow-y-auto">
              {items.map((item) => {
                const href = notificationHref(item);
                return (
                  <li key={item.id}>
                    <Link
                      href={href}
                      role="menuitem"
                      className="block rounded-sm px-2 py-2 hover:bg-surface-sunken"
                      onClick={() => {
                        markRead.mutate(item.id);
                        setOpen(false);
                      }}
                    >
                      <p className="font-medium text-ink">{item.title}</p>
                      <p className="text-sm text-ink-soft">{item.message}</p>
                      <p className="mt-1 text-xs text-ink-faint">
                        {formatRelativeTime(item.createdAt)}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}

function notificationHref(item: AppNotification): string {
  const batchId = item.metadata?.importBatchId;
  if (item.type === 'EMAIL_IMPORT_READY' || item.type === 'EMAIL_IMPORT_UNMAPPED_ACCOUNT') {
    return batchId ? `/imports?batchId=${batchId}` : '/imports';
  }
  if (item.type === 'SAVINGS_GOAL_COMPLETED') {
    return item.metadata?.goalId ? `/savings-goals/${item.metadata.goalId}` : '/savings-goals';
  }
  return '/budgets';
}

function BellIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M10 2.5a4.5 4.5 0 0 0-4.5 4.5v1.7c0 .7-.22 1.38-.63 1.94L3.7 12.3A1 1 0 0 0 4.5 14h11a1 1 0 0 0 .8-1.7l-1.17-1.66a3.2 3.2 0 0 1-.63-1.94V7A4.5 4.5 0 0 0 10 2.5Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M8 14.5a2 2 0 0 0 4 0"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

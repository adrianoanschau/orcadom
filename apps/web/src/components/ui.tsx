'use client';

import Link from 'next/link';
import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { OFFLINE_WRITE_HINT, useOnlineStatus } from '@/hooks/use-online-status';
import { createPortal } from 'react-dom';
import { Drawer } from 'vaul';
import { formatMoney } from '@/lib/format';
import { colors } from '@/lib/tokens';
import {
  accountTypeLabels,
  transactionTypeLabels,
  type AccountType,
  type TransactionType,
} from '@/lib/labels';
import { CloseIcon } from './icons';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
  /** Desliga criar/editar enquanto o aparelho está offline e explica no título. */
  offlineLock?: boolean;
}

const buttonVariants = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-hairline bg-surface text-ink hover:bg-surface-sunken',
  ghost: 'text-brand hover:bg-brand-tint',
};

const buttonClass =
  'inline-flex min-h-11 items-center justify-center rounded-pill px-4 text-sm font-medium disabled:opacity-60';

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  offlineLock = false,
  disabled,
  title,
  ...props
}: ButtonProps) {
  const online = useOnlineStatus();
  const locked = offlineLock && !online;
  const button = (
    <button
      type={type}
      disabled={Boolean(disabled) || locked}
      title={locked ? undefined : title}
      className={`${buttonClass} ${buttonVariants[variant]} ${className}`}
      {...props}
    />
  );
  if (!locked) return button;
  return (
    <span title={OFFLINE_WRITE_HINT} className="inline-flex">
      {button}
    </span>
  );
}

export function ButtonLink({
  href,
  variant = 'primary',
  className = '',
  offlineLock = false,
  children,
}: {
  href: string;
  variant?: 'primary' | 'secondary' | 'ghost';
  className?: string;
  offlineLock?: boolean;
  children: ReactNode;
}) {
  const online = useOnlineStatus();
  const locked = offlineLock && !online;
  const classes = `${buttonClass} ${buttonVariants[variant]} ${className}`;
  if (locked) {
    return (
      <span title={OFFLINE_WRITE_HINT} className="inline-flex">
        <span aria-disabled="true" className={`${classes} cursor-not-allowed opacity-60`}>
          {children}
        </span>
      </span>
    );
  }
  return (
    <Link href={href} className={classes}>
      {children}
    </Link>
  );
}

interface FieldProps {
  label: string;
  error?: string;
  children: ReactNode;
}

export function Field({ label, error, children }: FieldProps) {
  return (
    <label className="block text-sm text-ink-soft">
      {label}
      <span className="mt-1 block">{children}</span>
      {error ? <span className="mt-1 block text-sm text-ink">{error}</span> : null}
    </label>
  );
}

export const controlClass =
  'w-full min-h-11 rounded-sm bg-surface-sunken px-3 py-2 text-base text-ink outline-none focus:ring-2 focus:ring-brand';

export function Select({ className = '', ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${controlClass} ${className}`} {...props} />;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm bg-surface-sunken px-3 py-2 text-sm text-ink">
      {children}
    </p>
  );
}

export function PageHeader({
  title,
  description,
  children,
  display = false,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
  display?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1
          className={`font-display font-semibold ${display ? 'text-[2rem] leading-none sm:text-display' : 'text-h1'}`}
        >
          {title}
        </h1>
        {description ? <p className="mt-2 text-sm text-ink-soft">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <div className="mt-6 rounded-lg bg-surface p-6">
      {title ? <h2 className="font-display text-h2 font-medium">{title}</h2> : null}
      <div className={title ? 'mt-2 text-sm text-ink-soft' : 'text-sm text-ink-soft'}>
        {children}
      </div>
    </div>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      data-orcadom-modal=""
      className="fixed inset-0 z-40 flex h-dvh items-stretch justify-stretch bg-ink/40 p-0 [color-scheme:light] md:items-center md:justify-center md:p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-dvh w-full flex-col overflow-hidden bg-surface text-ink md:max-h-[calc(100dvh-2rem)] md:w-[min(32rem,calc(100%-2rem))] md:rounded-lg"
        onClick={(event) => {
          event.stopPropagation();
        }}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 md:px-6 md:pt-6">
          <h2 id={titleId} className="font-display text-h2 font-medium">
            {title}
          </h2>
          <button
            type="button"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken"
            aria-label="Fechar"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 md:px-6 md:pb-6">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const BOTTOM_SHEET_HISTORY = 'orcadomBottomSheet';
const DESKTOP_SHELL_QUERY = '(min-width: 1024px)';

let bottomSheetGeneration = 0;
let suppressBottomSheetPop = false;

function bottomSheetGenerationFrom(state: unknown) {
  if (typeof state !== 'object' || state === null) return null;
  const value = (state as Record<string, unknown>)[BOTTOM_SHEET_HISTORY];
  return typeof value === 'number' ? value : null;
}

function copyHistoryState(state: unknown) {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) return {};
  const copy: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(state)) {
    copy[key] = value as unknown;
  }
  return copy;
}

function useBottomSheetHistory(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    const generation = ++bottomSheetGeneration;
    const nextState = {
      ...copyHistoryState(window.history.state),
      [BOTTOM_SHEET_HISTORY]: generation,
    };
    if (bottomSheetGenerationFrom(window.history.state) === null) {
      window.history.pushState(nextState, '');
    } else {
      window.history.replaceState(nextState, '');
    }

    let closedByPop = false;

    const onPopState = () => {
      closedByPop = true;
      if (suppressBottomSheetPop) return;
      onCloseRef.current();
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      queueMicrotask(() => {
        if (bottomSheetGeneration !== generation || closedByPop) return;
        if (bottomSheetGenerationFrom(window.history.state) === null) return;
        suppressBottomSheetPop = true;
        const swallow = () => {
          window.removeEventListener('popstate', swallow);
          queueMicrotask(() => {
            suppressBottomSheetPop = false;
          });
        };
        window.addEventListener('popstate', swallow);
        window.history.back();
      });
    };
  }, [open]);
}

export function navigateAfterBottomSheet(navigate: () => void) {
  if (bottomSheetGenerationFrom(window.history.state) === null) {
    navigate();
    return;
  }
  const onPop = () => {
    window.removeEventListener('popstate', onPop);
    navigate();
  };
  window.addEventListener('popstate', onPop);
}

function useCloseBottomSheetOnDesktop(open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia(DESKTOP_SHELL_QUERY);
    const closeIfDesktop = () => {
      if (query.matches) onCloseRef.current();
    };
    closeIfDesktop();
    query.addEventListener('change', closeIfDesktop);
    return () => {
      query.removeEventListener('change', closeIfDesktop);
    };
  }, [open]);
}

function SheetChrome({
  title,
  titleId,
  children,
}: {
  title: string;
  titleId: string;
  children: ReactNode;
}) {
  return (
    <>
      <Drawer.Close
        aria-label="Fechar"
        className="flex min-h-11 w-full shrink-0 items-center justify-center"
      >
        <span className="h-1 w-9 rounded-pill bg-hairline" aria-hidden />
      </Drawer.Close>
      <Drawer.Title id={titleId} className="px-5 font-display text-h2 font-medium">
        {title}
      </Drawer.Title>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
        {children}
      </div>
    </>
  );
}

export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();
  useBottomSheetHistory(open, onClose);
  useCloseBottomSheetOnDesktop(open, onClose);

  return (
    <Drawer.Root
      open={open}
      autoFocus
      direction="bottom"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/40 lg:hidden" />
        <Drawer.Content
          aria-describedby={undefined}
          aria-labelledby={titleId}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-lg bg-surface text-ink outline-none lg:hidden"
          style={{
            colorScheme: 'light',
            maxHeight: 'min(85dvh, calc(100dvh - env(safe-area-inset-top)))',
          }}
        >
          <SheetChrome title={title} titleId={titleId}>
            {children}
          </SheetChrome>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export function InModalSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, onClose]);

  return (
    <Drawer.Root
      open={open}
      autoFocus
      shouldScaleBackground={false}
      direction="bottom"
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/30" />
        <Drawer.Content
          aria-describedby={undefined}
          aria-labelledby={titleId}
          className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-lg bg-surface text-ink outline-none"
          style={{
            colorScheme: 'light',
            maxHeight: 'min(85dvh, calc(100dvh - env(safe-area-inset-top)))',
          }}
        >
          <SheetChrome title={title} titleId={titleId}>
            {children}
          </SheetChrome>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

export type StatusTone = 'neutral' | 'brand' | 'income' | 'expense' | 'transfer' | 'pending';

const statusToneClass: Record<StatusTone, string> = {
  neutral: 'bg-surface-sunken text-ink-soft',
  brand: 'bg-brand-tint text-brand',
  income: 'bg-income/10 text-income',
  expense: 'bg-expense/10 text-expense',
  transfer: 'bg-transfer/10 text-transfer',
  pending: 'bg-pending/15 text-pending',
};

export function StatusBadge({
  tone = 'neutral',
  children,
}: {
  tone?: StatusTone;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-pill px-2.5 py-1 text-sm font-medium ${statusToneClass[tone]}`}
    >
      {children}
    </span>
  );
}

export function CategoryChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex max-w-full min-w-0 items-center gap-2 rounded-pill bg-surface-sunken px-3 py-1 text-sm text-ink">
      <span
        className="size-2 shrink-0 rounded-pill"
        style={{ backgroundColor: color ?? colors.brand }}
        aria-hidden
      />
      <span className="min-w-0 truncate">{name}</span>
    </span>
  );
}

export function AccountCard({
  name,
  type,
  balance,
  color,
  restricted,
  children,
}: {
  name: string;
  type: AccountType;
  balance: string;
  color: string | null;
  restricted?: boolean;
  children?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-hairline bg-surface p-6">
      <p className="text-sm text-ink-soft">{accountTypeLabels[type]}</p>
      <h3 className="mt-1 flex items-center gap-2 font-display text-h2 font-medium">
        {color ? (
          <span className="size-2.5 rounded-pill" style={{ backgroundColor: color }} aria-hidden />
        ) : null}
        {name}
        {restricted ? <StatusBadge tone="pending">restrita</StatusBadge> : null}
      </h3>
      <p className="mt-4 text-amount font-bold tabular-nums underline decoration-dashed underline-offset-4">
        {formatMoney(balance)}
      </p>
      {children ? <div className="mt-4 flex flex-wrap gap-2">{children}</div> : null}
    </article>
  );
}

const typeDot: Record<TransactionType, string> = {
  INCOME: 'bg-income',
  EXPENSE: 'bg-expense',
  TRANSFER: 'bg-transfer',
};

const typeText: Record<TransactionType, string> = {
  INCOME: 'text-income',
  EXPENSE: 'text-expense',
  TRANSFER: 'text-transfer',
};

export function TransactionRow({
  description,
  type,
  amount,
  meta,
  children,
}: {
  description: string;
  type: TransactionType;
  amount: string;
  meta: string;
  children?: ReactNode;
}) {
  const sign = type === 'INCOME' ? '+' : type === 'EXPENSE' ? '−' : '';
  return (
    <li className="flex flex-col gap-3 border-b border-hairline py-3 last:border-b-0 sm:flex-row sm:items-center">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className={`size-8 shrink-0 rounded-pill ${typeDot[type]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="truncate text-ink">{description}</p>
          <p className="text-sm text-ink-soft">{`${transactionTypeLabels[type]} · ${meta}`}</p>
        </div>
        <p
          className={`shrink-0 text-right text-base font-bold tabular-nums sm:text-amount ${typeText[type]}`}
        >
          {sign}
          {formatMoney(amount)}
        </p>
      </div>
      {children ? <div className="flex flex-wrap gap-2 sm:shrink-0">{children}</div> : null}
    </li>
  );
}

export type ProgressTone = 'brand' | 'income' | 'expense' | 'pending';

const progressToneClass: Record<ProgressTone, string> = {
  brand: 'bg-brand',
  income: 'bg-income',
  expense: 'bg-expense',
  pending: 'bg-pending',
};

export function ProgressBar({
  ratio,
  tone = 'brand',
  label,
}: {
  ratio: number;
  tone?: ProgressTone;
  label: string;
}) {
  const percent = Math.min(Math.max(ratio, 0) * 100, 100);
  return (
    <div
      className="h-2 overflow-hidden rounded-pill bg-surface-sunken"
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(percent)}
      aria-label={label}
    >
      <div
        className={`h-full rounded-pill ${progressToneClass[tone]}`}
        style={{ width: `${String(percent)}%` }}
      />
    </div>
  );
}

const budgetBarTone: Record<'on_track' | 'warning' | 'exceeded', ProgressTone> = {
  on_track: 'income',
  warning: 'pending',
  exceeded: 'expense',
};

const budgetBadgeTone: Record<'on_track' | 'warning' | 'exceeded', StatusTone> = {
  on_track: 'income',
  warning: 'pending',
  exceeded: 'expense',
};

const budgetStatusLabel: Record<'on_track' | 'warning' | 'exceeded', string> = {
  on_track: 'No ritmo',
  warning: 'Atenção',
  exceeded: 'Estourado',
};

export function BudgetProgressBar({
  spent,
  limit,
  ratio,
  status,
}: {
  spent: string;
  limit: string;
  ratio: number;
  status: 'on_track' | 'warning' | 'exceeded';
}) {
  return (
    <div>
      <ProgressBar
        ratio={ratio}
        tone={budgetBarTone[status]}
        label={`${budgetStatusLabel[status]}: ${formatMoney(spent)} de ${formatMoney(limit)}`}
      />
      <p className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="tabular-nums text-ink">
          {formatMoney(spent)} de {formatMoney(limit)}
        </span>
        <StatusBadge tone={budgetBadgeTone[status]}>{budgetStatusLabel[status]}</StatusBadge>
      </p>
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'income' | 'expense' | 'balance';
}) {
  const valueClass =
    tone === 'income'
      ? 'text-income'
      : tone === 'expense'
        ? 'text-expense'
        : 'text-ink underline decoration-dashed underline-offset-4';
  return (
    <article className="rounded-md bg-surface p-6">
      <p className="text-sm text-ink-soft">{label}</p>
      <p
        className={`mt-2 font-bold tabular-nums ${tone === 'balance' ? 'text-h1' : 'text-amount'} ${valueClass}`}
      >
        {value}
      </p>
    </article>
  );
}

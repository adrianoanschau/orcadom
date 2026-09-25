'use client';

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
} from 'react';
import { formatMoney } from '@/lib/format';
import {
  accountTypeLabels,
  transactionTypeLabels,
  type AccountType,
  type TransactionType,
} from '@/lib/labels';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost';
}

const buttonVariants = {
  primary: 'bg-brand text-white hover:bg-brand-hover',
  secondary: 'border border-hairline bg-surface text-ink hover:bg-surface-sunken',
  ghost: 'text-brand hover:bg-brand-tint',
};

export function Button({
  variant = 'primary',
  className = '',
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center rounded-pill px-4 py-2 text-sm font-medium disabled:opacity-60 ${buttonVariants[variant]} ${className}`}
      {...props}
    />
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
  'w-full rounded-sm bg-surface-sunken px-3 py-2 text-base text-ink outline-none focus:ring-2 focus:ring-brand';

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={controlClass} {...props} />;
}

export function Notice({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded-sm bg-surface-sunken px-3 py-2 text-sm text-ink">
      {children}
    </p>
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
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

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
      className="fixed top-1/2 left-1/2 m-0 max-h-[calc(100dvh-2rem)] w-[min(32rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-lg border-0 bg-surface p-6 text-ink backdrop:bg-ink/40"
      onClose={() => {
        if (open) onClose();
      }}
    >
      <h2 id={titleId} className="font-display text-[21px] font-medium">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </dialog>
  );
}

export function CategoryChip({ name, color }: { name: string; color: string | null }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-pill bg-surface-sunken px-3 py-1 text-sm text-ink">
      <span
        className="size-2 rounded-pill"
        style={{ backgroundColor: color ?? '#0d6e63' }}
        aria-hidden
      />
      {name}
    </span>
  );
}

export function AccountCard({
  name,
  type,
  balance,
  color,
  children,
}: {
  name: string;
  type: AccountType;
  balance: string;
  color: string | null;
  children?: ReactNode;
}) {
  return (
    <article className="rounded-lg border border-hairline bg-surface p-6">
      <p className="text-sm text-ink-soft">{accountTypeLabels[type]}</p>
      <h3 className="mt-1 flex items-center gap-2 font-display text-[21px] font-medium">
        {color ? (
          <span className="size-2.5 rounded-pill" style={{ backgroundColor: color }} aria-hidden />
        ) : null}
        {name}
      </h3>
      <p className="mt-4 text-xl font-bold tabular-nums underline decoration-dashed underline-offset-4">
        {formatMoney(balance)}
      </p>
      {children ? <div className="mt-4 flex gap-2">{children}</div> : null}
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
    <li className="flex items-center gap-3 border-b border-hairline py-3 last:border-b-0">
      <span className={`size-8 shrink-0 rounded-pill ${typeDot[type]}`} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="truncate text-ink">{description}</p>
        <p className="text-sm text-ink-soft">
          {transactionTypeLabels[type]} · {meta}
        </p>
      </div>
      <p className={`text-right text-[20px] font-bold tabular-nums ${typeText[type]}`}>
        {sign}
        {formatMoney(amount)}
      </p>
      {children}
    </li>
  );
}

const budgetBarTone: Record<'on_track' | 'warning' | 'exceeded', string> = {
  on_track: 'bg-income',
  warning: 'bg-pending',
  exceeded: 'bg-expense',
};

const budgetLabelTone: Record<'on_track' | 'warning' | 'exceeded', string> = {
  on_track: 'text-income',
  warning: 'text-pending',
  exceeded: 'text-expense',
};

const budgetStatusLabel: Record<'on_track' | 'warning' | 'exceeded', string> = {
  on_track: 'No ritmo',
  warning: 'Atenção',
  exceeded: 'Estourado',
};

export function ProgressBar({
  ratio,
  toneClass,
  label,
}: {
  ratio: number;
  toneClass: string;
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
      <div className={`h-full rounded-pill ${toneClass}`} style={{ width: `${String(percent)}%` }} />
    </div>
  );
}

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
        toneClass={budgetBarTone[status]}
        label={`${budgetStatusLabel[status]}: ${formatMoney(spent)} de ${formatMoney(limit)}`}
      />
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="tabular-nums text-ink">
          {formatMoney(spent)} de {formatMoney(limit)}
        </span>
        <span className={budgetLabelTone[status]}>{budgetStatusLabel[status]}</span>
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
        className={`mt-2 text-[20px] font-bold tabular-nums ${tone === 'balance' ? 'text-[28px]' : ''} ${valueClass}`}
      >
        {value}
      </p>
    </article>
  );
}

'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useLocale } from './locale-provider';
import { formatInputDate, formatInputMonth, weekdayLabels, weekStartsOn } from '@/lib/locale';
import { controlClass } from './ui';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateValue(year: number, month: number, day: number): string {
  return `${String(year)}-${pad(month + 1)}-${pad(day)}`;
}

function toMonthValue(year: number, month: number): string {
  return `${String(year)}-${pad(month + 1)}`;
}

function parseDateValue(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function parseMonthValue(value: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1 };
}

function monthLabel(year: number, month: number, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
    new Date(year, month, 1),
  );
}

function usePopover() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return { open, setOpen, rootRef };
}

export function DateInput({
  value,
  onChange,
  allowEmpty = false,
}: {
  value: string;
  onChange: (value: string) => void;
  allowEmpty?: boolean;
}) {
  const { locale } = useLocale();
  const { open, setOpen, rootRef } = usePopover();
  const menuId = useId();
  const parsed = parseDateValue(value);
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: parsed?.year ?? now.getFullYear(),
    month: parsed?.month ?? now.getMonth(),
  });

  useEffect(() => {
    const next = parseDateValue(value);
    if (next) setCursor({ year: next.year, month: next.month });
  }, [value]);

  const weekStart = weekStartsOn(locale);
  const labels = weekdayLabels(locale, weekStart);
  const first = new Date(cursor.year, cursor.month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  const days = Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor.year, cursor.month, 1 - offset + index);
    return {
      key: toDateValue(date.getFullYear(), date.getMonth(), date.getDate()),
      day: date.getDate(),
      inMonth: date.getMonth() === cursor.month,
    };
  });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
        className={`${controlClass} text-left`}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {parsed ? formatInputDate(value, locale) : 'Selecionar data'}
      </button>
      {open ? (
        <div
          id={menuId}
          role="dialog"
          className="absolute z-50 mt-1 w-72 rounded-md border border-hairline bg-surface p-3 shadow-sm"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <NavButton
              label="Mês anterior"
              onClick={() => {
                setCursor((current) =>
                  current.month === 0
                    ? { year: current.year - 1, month: 11 }
                    : { year: current.year, month: current.month - 1 },
                );
              }}
            >
              ‹
            </NavButton>
            <p className="text-sm font-medium capitalize text-ink">
              {monthLabel(cursor.year, cursor.month, locale)}
            </p>
            <NavButton
              label="Próximo mês"
              onClick={() => {
                setCursor((current) =>
                  current.month === 11
                    ? { year: current.year + 1, month: 0 }
                    : { year: current.year, month: current.month + 1 },
                );
              }}
            >
              ›
            </NavButton>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-faint">
            {labels.map((label) => (
              <span key={label} className="py-1 capitalize">
                {label}
              </span>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-1">
            {days.map((item) => {
              const selected = item.key === value;
              return (
                <button
                  key={item.key}
                  type="button"
                  className={`min-h-9 rounded-sm text-sm ${selected ? 'bg-brand text-white' : item.inMonth ? 'text-ink hover:bg-surface-sunken' : 'text-ink-faint hover:bg-surface-sunken'}`}
                  onClick={() => {
                    onChange(item.key);
                    setOpen(false);
                  }}
                >
                  {item.day}
                </button>
              );
            })}
          </div>
          {allowEmpty ? (
            <button
              type="button"
              className="mt-2 w-full rounded-sm py-2 text-sm text-ink-soft hover:bg-surface-sunken"
              onClick={() => {
                onChange('');
                setOpen(false);
              }}
            >
              Limpar
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export function MonthInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { locale } = useLocale();
  const { open, setOpen, rootRef } = usePopover();
  const menuId = useId();
  const parsed = parseMonthValue(value);
  const now = new Date();
  const [year, setYear] = useState(parsed?.year ?? now.getFullYear());

  useEffect(() => {
    const next = parseMonthValue(value);
    if (next) setYear(next.year);
  }, [value]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={menuId}
        aria-haspopup="dialog"
        className={`${controlClass} text-left`}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        {parsed ? formatInputMonth(value, locale) : 'Selecionar mês'}
      </button>
      {open ? (
        <div
          id={menuId}
          role="dialog"
          className="absolute right-0 z-50 mt-1 w-72 rounded-md border border-hairline bg-surface p-3 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <NavButton
              label="Ano anterior"
              onClick={() => {
                setYear((current) => current - 1);
              }}
            >
              ‹
            </NavButton>
            <p className="text-sm font-medium text-ink">{year}</p>
            <NavButton
              label="Próximo ano"
              onClick={() => {
                setYear((current) => current + 1);
              }}
            >
              ›
            </NavButton>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 12 }, (_, month) => {
              const key = toMonthValue(year, month);
              const selected = key === value;
              const label = new Intl.DateTimeFormat(locale, { month: 'short' }).format(
                new Date(year, month, 1),
              );
              return (
                <button
                  key={key}
                  type="button"
                  className={`min-h-11 rounded-sm text-sm capitalize ${selected ? 'bg-brand text-white' : 'text-ink hover:bg-surface-sunken'}`}
                  onClick={() => {
                    onChange(key);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className="inline-flex size-9 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

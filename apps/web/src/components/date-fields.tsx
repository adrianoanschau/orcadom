'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
  type UIEvent,
} from 'react';
import { useLocale } from './locale-provider';
import { formatInputDate, formatInputMonth, weekdayLabels, weekStartsOn } from '@/lib/locale';
import { currentMonth } from '@/lib/format';
import {
  canShiftYear,
  maxMonthYear,
  MIN_MONTH_YEAR,
  parseMonthValue,
  shiftMonth,
  toMonthValue,
} from '@/lib/month-range';
import { useMediaQuery } from '@/hooks/use-media-query';
import { BottomSheet, Button, controlClass } from './ui';

const DESKTOP_MONTH_QUERY = '(min-width: 768px)';
const PANEL_MARGIN = 8;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateValue(year: number, month: number, day: number): string {
  return `${String(year)}-${pad(month + 1)}-${pad(day)}`;
}

function parseDateValue(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
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
  const isDesktop = useMediaQuery(DESKTOP_MONTH_QUERY);
  const { open, setOpen, rootRef } = usePopover();
  const menuId = useId();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const monthListRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const parsed = parseMonthValue(value);
  const now = new Date();
  const [cursor, setCursor] = useState(parsed ? value : currentMonth());

  useLayoutEffect(() => {
    if (!open) return;
    setCursor(parseMonthValue(value) ? value : currentMonth());
  }, [open, value]);

  const cursorParts = parseMonthValue(cursor) ?? {
    year: now.getFullYear(),
    month: now.getMonth(),
  };
  const canGoPrev = shiftMonth(value, -1, now) !== value;
  const canGoNext = shiftMonth(value, 1, now) !== value;
  const canYearPrev = canShiftYear(cursorParts.year, -1, now);
  const canYearNext = canShiftYear(cursorParts.year, 1, now);
  const today = currentMonth();

  useEffect(() => {
    if (!open || !isDesktop) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-month="${cursor}"]`)?.focus({
      preventScroll: true,
    });
  }, [open, isDesktop, cursor]);

  useEffect(() => {
    if (!open || isDesktop) return;
    const frame = window.requestAnimationFrame(() => {
      monthListRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, isDesktop]);

  function stepTrigger(delta: number) {
    const next = shiftMonth(value, delta, now);
    if (next !== value) onChange(next);
  }

  function moveCursor(delta: number) {
    const next = shiftMonth(cursor, delta, now);
    if (next !== cursor) setCursor(next);
  }

  function moveYear(delta: number) {
    if (!canShiftYear(cursorParts.year, delta, now)) return;
    setCursor(toMonthValue(cursorParts.year + delta, cursorParts.month));
  }

  const years: number[] = [];
  const firstYear = Math.min(MIN_MONTH_YEAR, cursorParts.year);
  const lastYear = Math.max(maxMonthYear(now), cursorParts.year);
  for (let year = firstYear; year <= lastYear; year += 1) years.push(year);

  const monthItems = Array.from({ length: 12 }, (_, month) => ({
    value: String(month),
    label: new Intl.DateTimeFormat(locale, { month: 'long' }).format(new Date(2024, month, 1)),
  }));
  const yearItems = years.map((year) => ({ value: String(year), label: String(year) }));

  return (
    <div ref={rootRef} className="relative min-w-0">
      <div className="flex min-w-0 items-center gap-1">
        <button
          type="button"
          aria-label="Mês anterior"
          aria-disabled={!canGoPrev}
          disabled={!canGoPrev}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken disabled:opacity-40"
          onClick={() => {
            stepTrigger(-1);
          }}
        >
          ‹
        </button>
        <button
          ref={anchorRef}
          type="button"
          aria-expanded={open}
          aria-controls={open && isDesktop ? menuId : undefined}
          aria-haspopup="dialog"
          className={`${controlClass} min-w-0 flex-1 truncate text-left`}
          onClick={() => {
            setOpen((current) => !current);
          }}
        >
          {parsed ? formatInputMonth(value, locale) : 'Selecionar mês'}
        </button>
        <button
          type="button"
          aria-label="Próximo mês"
          aria-disabled={!canGoNext}
          disabled={!canGoNext}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken disabled:opacity-40"
          onClick={() => {
            stepTrigger(1);
          }}
        >
          ›
        </button>
      </div>
      {open && isDesktop ? (
        <AnchoredPanel
          anchorRef={anchorRef}
          id={menuId}
          className="rounded-md border border-hairline bg-surface p-3 shadow-sm"
        >
          <div className="mb-3 flex items-center justify-between gap-2">
            <NavButton
              label="Ano anterior"
              disabled={!canYearPrev}
              className="min-h-11 min-w-11"
              onClick={() => {
                moveYear(-1);
              }}
            >
              ‹
            </NavButton>
            <p className="text-sm font-medium text-ink">{cursorParts.year}</p>
            <NavButton
              label="Próximo ano"
              disabled={!canYearNext}
              className="min-h-11 min-w-11"
              onClick={() => {
                moveYear(1);
              }}
            >
              ›
            </NavButton>
          </div>
          <div
            ref={gridRef}
            className="grid grid-cols-3 gap-2"
            onKeyDown={(event) => {
              const steps: Record<string, number> = {
                ArrowLeft: -1,
                ArrowRight: 1,
                ArrowUp: -3,
                ArrowDown: 3,
              };
              const delta = steps[event.key];
              if (delta) {
                event.preventDefault();
                moveCursor(delta);
              }
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
              }
            }}
          >
            {Array.from({ length: 12 }, (_, month) => {
              const key = toMonthValue(cursorParts.year, month);
              const selected = key === value;
              const current = key === today;
              const label = new Intl.DateTimeFormat(locale, { month: 'short' }).format(
                new Date(cursorParts.year, month, 1),
              );
              return (
                <button
                  key={key}
                  type="button"
                  data-month={key}
                  tabIndex={key === cursor ? 0 : -1}
                  className={`min-h-11 rounded-sm text-sm capitalize focus-visible:ring-2 focus-visible:ring-brand ${selected ? 'bg-brand text-white' : current ? 'bg-brand-tint text-brand' : 'text-ink hover:bg-surface-sunken'}`}
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
          <Button
            variant="secondary"
            className="mt-3 w-full"
            onClick={() => {
              onChange(today);
              setOpen(false);
            }}
          >
            Mês atual
          </Button>
        </AnchoredPanel>
      ) : null}
      {open && !isDesktop ? (
        <BottomSheet
          open
          title="Mês"
          onClose={() => {
            setOpen(false);
          }}
        >
          <div className="relative">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-1/2 z-0 h-11 -translate-y-1/2 rounded-sm bg-brand-tint"
            />
            <div className="relative z-10 grid grid-cols-2 gap-2">
              <WheelColumn
                label="Mês"
                items={monthItems}
                value={String(cursorParts.month)}
                onChange={(next) => {
                  setCursor(toMonthValue(cursorParts.year, Number(next)));
                }}
                listRef={monthListRef}
              />
              <WheelColumn
                label="Ano"
                items={yearItems}
                value={String(cursorParts.year)}
                onChange={(next) => {
                  setCursor(toMonthValue(Number(next), cursorParts.month));
                }}
              />
            </div>
          </div>
          <div className="mt-4 space-y-2">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setCursor(today);
              }}
            >
              Mês atual
            </Button>
            <Button
              className="w-full"
              onClick={() => {
                onChange(cursor);
                setOpen(false);
              }}
            >
              Confirmar
            </Button>
          </div>
        </BottomSheet>
      ) : null}
    </div>
  );
}

function NavButton({
  label,
  onClick,
  children,
  disabled = false,
  className,
}: {
  label: string;
  onClick: () => void;
  children: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={disabled}
      disabled={disabled}
      className={`inline-flex ${className ?? 'size-9'} items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken${disabled ? ' disabled:opacity-40' : ''}`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

export function AnchoredPanel({
  anchorRef,
  children,
  className = '',
  id,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor) return;

    const update = () => {
      const anchorRect = anchor.getBoundingClientRect();
      const parent = panel.offsetParent instanceof HTMLElement ? panel.offsetParent : null;
      const parentRect = parent?.getBoundingClientRect() ?? { left: 0, top: 0 };
      const maxWidth = window.innerWidth - PANEL_MARGIN * 2;
      let width = Math.min(panel.scrollWidth, maxWidth);
      let left = anchorRect.left - parentRect.left;
      if (anchorRect.left + width > window.innerWidth - PANEL_MARGIN) {
        left = anchorRect.right - parentRect.left - width;
      }
      if (parentRect.left + left < PANEL_MARGIN) {
        left = PANEL_MARGIN - parentRect.left;
        width = Math.min(width, maxWidth);
      }
      const height = panel.offsetHeight;
      const spaceBelow = window.innerHeight - anchorRect.bottom;
      const spaceAbove = anchorRect.top;
      const openUp = height > spaceBelow - PANEL_MARGIN && spaceAbove > spaceBelow;
      const top = openUp
        ? anchorRect.top - parentRect.top - height - 4
        : anchorRect.bottom - parentRect.top + 4;
      setStyle((current) => {
        if (current.left === left && current.top === top && current.width === width) return current;
        return { left, top, width, maxWidth };
      });
    };

    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [anchorRef]);

  return (
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      style={style}
      className={`absolute top-full left-0 z-50 w-72 [color-scheme:light] ${className}`}
    >
      {children}
    </div>
  );
}

function WheelColumn({
  label,
  items,
  value,
  onChange,
  listRef,
}: {
  label: string;
  items: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  listRef?: RefObject<HTMLDivElement | null>;
}) {
  const innerRef = useRef<HTMLDivElement>(null);
  const ref = listRef ?? innerRef;
  const fromScroll = useRef(false);

  useLayoutEffect(() => {
    if (fromScroll.current) {
      fromScroll.current = false;
      return;
    }
    const list = ref.current;
    const option = list?.querySelector<HTMLElement>(`[data-value="${value}"]`);
    if (!list || !option) return;
    const top = option.offsetTop - (list.clientHeight - option.offsetHeight) / 2;
    list.scrollTo({ top, behavior: 'auto' });
  }, [ref, value]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const list = event.currentTarget;
    const mid = list.scrollTop + list.clientHeight / 2;
    let best = value;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const option of list.querySelectorAll<HTMLElement>('[data-value]')) {
      const center = option.offsetTop + option.offsetHeight / 2;
      const dist = Math.abs(center - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = option.dataset.value ?? best;
      }
    }
    if (best !== value) {
      fromScroll.current = true;
      onChange(best);
    }
  }

  function onKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = items.findIndex((item) => item.value === value);
    const next = items[index + (event.key === 'ArrowDown' ? 1 : -1)];
    if (next) onChange(next.value);
  }

  return (
    <div
      ref={ref}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      className="h-[220px] overflow-y-auto overscroll-contain py-[88px] snap-y snap-mandatory focus-visible:outline-none [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]"
      onScroll={onScroll}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="option"
            data-value={item.value}
            aria-selected={selected}
            className={`flex h-11 w-full snap-center items-center justify-center text-sm text-ink ${selected ? 'font-medium' : ''}`}
            onClick={() => {
              onChange(item.value);
            }}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

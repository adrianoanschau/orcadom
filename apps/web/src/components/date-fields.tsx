'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
  type TransitionEvent as ReactTransitionEvent,
  type UIEvent,
} from 'react';
import { createPortal, flushSync } from 'react-dom';
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
import { BottomSheet, Button, InModalSheet, controlClass } from './ui';

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
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (
        target instanceof Element &&
        (target.closest('[data-orcadom-panel]') || target.closest('[data-vaul-drawer]'))
      ) {
        return;
      }
      setOpen(false);
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
  const isDesktop = useMediaQuery(DESKTOP_MONTH_QUERY);
  const [open, setOpen] = useState(false);
  const [insideDialog, setInsideDialog] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const parsed = parseDateValue(value);
  const now = new Date();
  const [cursor, setCursor] = useState({
    year: parsed?.year ?? now.getFullYear(),
    month: parsed?.month ?? now.getMonth(),
  });
  const sheet = open && !isDesktop && !insideDialog;
  const dialogPanel = open && !isDesktop && insideDialog;
  const popover = open && isDesktop;

  useEffect(() => {
    const next = parseDateValue(value);
    if (next) setCursor({ year: next.year, month: next.month });
  }, [value]);

  useEffect(() => {
    if (!open || !isDesktop) return;
    function onPointer(event: PointerEvent) {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-orcadom-panel]')) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
    }
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, isDesktop]);

  function dismiss() {
    setOpen(false);
  }

  function toggle() {
    if (open) {
      dismiss();
      return;
    }
    const host = overlayHost(rootRef.current);
    setInsideDialog(Boolean(host && host !== document.body));
    setOpen(true);
  }

  const calendar = (
    <DateCalendar
      locale={locale}
      value={value}
      cursor={cursor}
      allowEmpty={allowEmpty}
      onCursorChange={setCursor}
      onPick={(next) => {
        onChange(next);
        dismiss();
      }}
    />
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={open && isDesktop ? menuId : undefined}
        aria-haspopup="dialog"
        className={`${controlClass} text-left`}
        onClick={toggle}
      >
        {parsed ? formatInputDate(value, locale) : 'Selecionar data'}
      </button>
      {sheet ? (
        <BottomSheet open title="Data" onClose={dismiss}>
          {calendar}
        </BottomSheet>
      ) : null}
      {dialogPanel ? (
        <InModalSheet open title="Data" onClose={dismiss}>
          {calendar}
        </InModalSheet>
      ) : null}
      {popover ? (
        <AnchoredPanel
          anchorRef={triggerRef}
          id={menuId}
          className="rounded-md border border-hairline bg-surface p-3 shadow-sm"
        >
          {calendar}
        </AnchoredPanel>
      ) : null}
    </div>
  );
}

interface MonthCursor {
  year: number;
  month: number;
}

const SWIPE_LOCK_PX = 10;
const SLIDE_MS = 220;

function shiftCursor(cursor: MonthCursor, delta: number): MonthCursor {
  const date = new Date(cursor.year, cursor.month + delta, 1);
  return { year: date.getFullYear(), month: date.getMonth() };
}

function monthDays(cursor: MonthCursor, weekStart: number) {
  const first = new Date(cursor.year, cursor.month, 1);
  const offset = (first.getDay() - weekStart + 7) % 7;
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(cursor.year, cursor.month, 1 - offset + index);
    return {
      key: toDateValue(date.getFullYear(), date.getMonth(), date.getDate()),
      day: date.getDate(),
      inMonth: date.getMonth() === cursor.month,
    };
  });
}

function swipeMonthDelta(dx: number, width: number, elapsedMs: number): -1 | 0 | 1 {
  const distance = Math.abs(dx);
  const threshold = Math.min(64, Math.max(36, width * 0.2));
  const velocity = distance / Math.max(elapsedMs, 1);
  if (distance < threshold && !(distance >= 20 && velocity >= 0.5)) return 0;
  return dx < 0 ? 1 : -1;
}

function useCalendarSwipe(cursor: MonthCursor, onCursorChange: (next: MonthCursor) => void) {
  const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    axis: 'x' | 'y' | null;
  } | null>(null);
  const suppressClick = useRef(false);
  const generation = useRef(0);
  const pending = useRef<{ gen: number; delta: -1 | 1; cursor: MonthCursor } | null>(null);
  const timer = useRef<number | null>(null);
  const [dragPx, setDragPx] = useState(0);
  const [headingDelta, setHeadingDelta] = useState<-1 | 0 | 1>(0);
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, []);

  function clearTimer() {
    if (timer.current === null) return;
    window.clearTimeout(timer.current);
    timer.current = null;
  }

  function resetVisual() {
    generation.current += 1;
    pending.current = null;
    clearTimer();
    setAnimate(false);
    setDragPx(0);
    setHeadingDelta(0);
  }

  function finishPending() {
    const slide = pending.current;
    if (slide?.gen !== generation.current) return;
    pending.current = null;
    clearTimer();
    setAnimate(false);
    setHeadingDelta(0);
    setDragPx(0);
    onCursorChange(shiftCursor(slide.cursor, slide.delta));
  }

  function jump(delta: -1 | 1) {
    const base = pending.current
      ? shiftCursor(pending.current.cursor, pending.current.delta)
      : cursor;
    resetVisual();
    onCursorChange(shiftCursor(base, delta));
  }

  function animateDragTo(px: number, heading?: -1 | 0 | 1) {
    if (reduceMotion) {
      setAnimate(false);
      setDragPx(px);
      if (heading !== undefined) setHeadingDelta(heading);
      return;
    }
    flushSync(() => {
      setAnimate(true);
      if (heading !== undefined) setHeadingDelta(heading);
    });
    setDragPx(px);
  }

  function commit(delta: -1 | 1) {
    if (reduceMotion) {
      jump(delta);
      return;
    }
    const gen = generation.current + 1;
    generation.current = gen;
    pending.current = { gen, delta, cursor };
    const width = viewportRef.current?.clientWidth ?? 0;
    clearTimer();
    animateDragTo(delta === 1 ? -width : width, delta);
    timer.current = window.setTimeout(() => {
      finishPending();
    }, SLIDE_MS + 40);
  }

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (pending.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest('[data-month-nav]')) return;
    if (animate) {
      flushSync(() => {
        setAnimate(false);
      });
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: event.timeStamp,
      axis: null,
    };
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.axis) {
      if (Math.abs(dx) < SWIPE_LOCK_PX && Math.abs(dy) < SWIPE_LOCK_PX) return;
      drag.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      if (drag.axis === 'y') {
        dragRef.current = null;
        return;
      }
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // The pointer can already be gone; the move listeners still track the gesture.
      }
    }
    if (event.cancelable) event.preventDefault();
    const width = viewportRef.current?.clientWidth ?? 0;
    setDragPx(width > 0 ? Math.max(-width, Math.min(width, dx)) : dx);
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) {
    const drag = dragRef.current;
    if (drag?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (drag.axis !== 'x') return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
    if (cancelled) {
      animateDragTo(0);
      return;
    }
    const delta = swipeMonthDelta(
      event.clientX - drag.startX,
      viewportRef.current?.clientWidth ?? 0,
      event.timeStamp - drag.startTime,
    );
    if (delta === 0) {
      animateDragTo(0);
      return;
    }
    commit(delta);
  }

  function onTransitionEnd(event: ReactTransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.propertyName !== 'transform') return;
    if (pending.current) {
      finishPending();
      return;
    }
    setAnimate(false);
  }

  const shown = headingDelta === 0 ? cursor : shiftCursor(cursor, headingDelta);

  return {
    viewportRef,
    suppressClick,
    shown,
    headingDelta,
    animate,
    dragPx,
    jump,
    resetVisual,
    onPointerDown,
    onPointerMove,
    onPointerUp: (event: ReactPointerEvent<HTMLDivElement>) => {
      endDrag(event, false);
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLDivElement>) => {
      endDrag(event, true);
    },
    onTransitionEnd,
  };
}

function DateCalendar({
  locale,
  value,
  cursor,
  allowEmpty,
  onCursorChange,
  onPick,
}: {
  locale: string;
  value: string;
  cursor: MonthCursor;
  allowEmpty: boolean;
  onCursorChange: (next: MonthCursor) => void;
  onPick: (value: string) => void;
}) {
  const weekStart = weekStartsOn(locale);
  const labels = weekdayLabels(locale, weekStart);
  const swipe = useCalendarSwipe(cursor, onCursorChange);
  const panels = [
    { slot: 'prev' as const, cursor: shiftCursor(cursor, -1) },
    { slot: 'current' as const, cursor },
    { slot: 'next' as const, cursor: shiftCursor(cursor, 1) },
  ];

  return (
    <>
      <div
        ref={swipe.viewportRef}
        className="touch-pan-y select-none overscroll-x-contain"
        onPointerDown={swipe.onPointerDown}
        onPointerMove={swipe.onPointerMove}
        onPointerUp={swipe.onPointerUp}
        onPointerCancel={swipe.onPointerCancel}
        onClickCapture={(event) => {
          if (!swipe.suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-2">
          <span data-month-nav="">
            <NavButton
              label="Mês anterior"
              onClick={() => {
                swipe.jump(-1);
              }}
            >
              ‹
            </NavButton>
          </span>
          <p className="text-sm font-medium capitalize text-ink" aria-live="polite">
            {monthLabel(swipe.shown.year, swipe.shown.month, locale)}
          </p>
          <span data-month-nav="">
            <NavButton
              label="Próximo mês"
              onClick={() => {
                swipe.jump(1);
              }}
            >
              ›
            </NavButton>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-faint">
          {labels.map((label) => (
            <span key={label} className="py-1 capitalize">
              {label}
            </span>
          ))}
        </div>
        <div className="mt-1 overflow-x-hidden">
          <div
            className="flex w-[300%]"
            style={{
              transform: `translate3d(calc(-33.333333% + ${String(swipe.dragPx)}px), 0, 0)`,
              transition: swipe.animate ? `transform ${String(SLIDE_MS)}ms ease-out` : 'none',
            }}
            onTransitionEnd={swipe.onTransitionEnd}
          >
            {panels.map((panel, index) => (
              <div
                key={panel.slot}
                className="grid w-1/3 shrink-0 grid-cols-7 gap-1"
                inert={index !== 1 + swipe.headingDelta}
              >
                {monthDays(panel.cursor, weekStart).map((item) => {
                  const selected = item.key === value;
                  return (
                    <button
                      key={item.key}
                      type="button"
                      className={`min-h-9 rounded-sm text-sm ${selected ? 'bg-brand text-white' : item.inMonth ? 'text-ink hover:bg-surface-sunken' : 'text-ink-faint hover:bg-surface-sunken'}`}
                      onClick={() => {
                        swipe.resetVisual();
                        onPick(item.key);
                      }}
                    >
                      {item.day}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      {allowEmpty ? (
        <button
          type="button"
          className="mt-2 w-full rounded-sm py-2 text-sm text-ink-soft hover:bg-surface-sunken"
          onClick={() => {
            swipe.resetVisual();
            onPick('');
          }}
        >
          Limpar
        </button>
      ) : null}
    </>
  );
}

export function MonthInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { locale } = useLocale();
  const isDesktop = useMediaQuery(DESKTOP_MONTH_QUERY);
  const { open, setOpen, rootRef } = usePopover();
  const [insideDialog, setInsideDialog] = useState(false);
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
  const monthSheet = (
    <>
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
    </>
  );

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
            setOpen((current) => {
              if (current) return false;
              const host = overlayHost(rootRef.current);
              setInsideDialog(Boolean(host && host !== document.body));
              return true;
            });
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
      {open && !isDesktop && !insideDialog ? (
        <BottomSheet
          open
          title="Mês"
          onClose={() => {
            setOpen(false);
          }}
        >
          {monthSheet}
        </BottomSheet>
      ) : null}
      {open && !isDesktop && insideDialog ? (
        <InModalSheet
          open
          title="Mês"
          onClose={() => {
            setOpen(false);
          }}
        >
          {monthSheet}
        </InModalSheet>
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

export const OVERLAY_HOST_SELECTOR = '[data-orcadom-modal]';

export function overlayHost(from: Element | null): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const modal = from?.closest(OVERLAY_HOST_SELECTOR);
  if (modal instanceof HTMLElement) return modal;
  return document.body;
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
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    setHost(overlayHost(anchorRef.current));
  }, [anchorRef]);

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (!panel || !anchor || !host) return;

    let measuredWidth: number | null = null;

    const measureWidth = () => {
      const maxWidth = window.innerWidth - PANEL_MARGIN * 2;
      const applied = panel.style.width;
      panel.style.width = '';
      const natural = Math.max(panel.offsetWidth, panel.scrollWidth);
      panel.style.width = applied;
      return Math.min(natural, maxWidth);
    };

    const update = (event?: Event) => {
      if (
        event?.type === 'scroll' &&
        event.target instanceof Node &&
        panel.contains(event.target)
      ) {
        return;
      }

      const anchorRect = anchor.getBoundingClientRect();
      const maxWidth = window.innerWidth - PANEL_MARGIN * 2;
      if (event?.type !== 'scroll' || measuredWidth === null) measuredWidth = measureWidth();
      let width = measuredWidth;
      let left = anchorRect.left;
      if (left + width > window.innerWidth - PANEL_MARGIN) {
        left = anchorRect.right - width;
      }
      if (left < PANEL_MARGIN) {
        left = PANEL_MARGIN;
        width = Math.min(width, maxWidth);
      }
      const height = panel.offsetHeight;
      const spaceBelow = window.innerHeight - anchorRect.bottom;
      const spaceAbove = anchorRect.top;
      const openUp = height > spaceBelow - PANEL_MARGIN && spaceAbove > spaceBelow;
      let top = openUp ? anchorRect.top - height - 4 : anchorRect.bottom + 4;
      if (top < PANEL_MARGIN) top = PANEL_MARGIN;
      if (top + height > window.innerHeight - PANEL_MARGIN) {
        top = Math.max(PANEL_MARGIN, window.innerHeight - PANEL_MARGIN - height);
      }
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
  }, [anchorRef, host]);

  if (!host) return null;

  return createPortal(
    <div
      ref={panelRef}
      id={id}
      role="dialog"
      data-orcadom-panel=""
      style={style}
      className={`fixed z-50 w-72 [color-scheme:light] ${className}`}
      onPointerDown={(event) => {
        event.stopPropagation();
      }}
    >
      {children}
    </div>,
    host,
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

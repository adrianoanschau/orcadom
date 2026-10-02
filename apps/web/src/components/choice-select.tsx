'use client';

import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react';
import { AnchoredPanel, overlayHost } from '@/components/date-fields';
import { BottomSheet, InModalSheet, controlClass } from '@/components/ui';
import { useMediaQuery } from '@/hooks/use-media-query';

const DESKTOP_CHOICE_QUERY = '(min-width: 768px)';

export interface ChoiceOption {
  value: string;
  label: string;
}

function optionDomId(listId: string, index: number) {
  return `${listId}-option-${String(index)}`;
}

function ChoiceOptions({
  query,
  onQueryChange,
  options,
  activeIndex,
  value,
  onPick,
  onActiveIndex,
  listId,
  searchLabel,
  listLabel,
  searchRef,
  listRef,
  onSearchKeyDown,
  className = '',
}: {
  query: string;
  onQueryChange: (query: string) => void;
  options: readonly ChoiceOption[];
  activeIndex: number;
  value: string;
  onPick: (id: string) => void;
  onActiveIndex: (index: number) => void;
  listId: string;
  searchLabel: string;
  listLabel: string;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const activeId = options[activeIndex] ? optionDomId(listId, activeIndex) : undefined;

  return (
    <div className={className}>
      <input
        ref={searchRef}
        className={controlClass}
        value={query}
        placeholder={searchLabel}
        aria-label={searchLabel}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded="true"
        aria-controls={listId}
        aria-activedescendant={activeId}
        onChange={(event) => {
          onQueryChange(event.target.value);
        }}
        onKeyDown={onSearchKeyDown}
      />
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-label={listLabel}
        className="mt-2 max-h-60 overflow-y-auto overscroll-contain"
      >
        {options.map((option, index) => {
          const selected = option.value === value;
          const active = index === activeIndex;
          return (
            <li key={option.value === '' ? 'empty' : option.value}>
              <button
                id={optionDomId(listId, index)}
                type="button"
                role="option"
                aria-selected={selected}
                tabIndex={-1}
                data-option-index={index}
                className={`min-h-11 w-full rounded-sm px-3 text-left text-sm ${
                  selected || active ? 'bg-brand-tint text-brand' : 'hover:bg-surface'
                }${active ? ' ring-2 ring-inset ring-brand' : ''}`}
                onMouseEnter={() => {
                  onActiveIndex(index);
                }}
                onPointerDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  onPick(option.value);
                }}
              >
                {option.label}
              </button>
            </li>
          );
        })}
        {options.length === 0 ? (
          <li className="px-3 py-2 text-sm text-ink-soft">Nenhuma opção encontrada.</li>
        ) : null}
      </ul>
    </div>
  );
}

export function ChoiceSelect({
  options,
  value,
  onChange,
  title,
  searchLabel,
  emptyLabel = 'Selecione',
  allowEmpty = true,
  disabled = false,
  className = '',
  ariaLabel,
}: {
  options: readonly ChoiceOption[];
  value: string;
  onChange: (value: string) => void;
  title: string;
  searchLabel: string;
  emptyLabel?: string;
  allowEmpty?: boolean;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  const isDesktop = useMediaQuery(DESKTOP_CHOICE_QUERY);
  const [open, setOpen] = useState(false);
  const [insideDialog, setInsideDialog] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocusRef = useRef(false);
  const listId = useId();
  const selected = options.find((option) => option.value === value)?.label ?? '';
  const rows = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    const next: ChoiceOption[] = allowEmpty ? [{ value: '', label: emptyLabel }] : [];
    for (const option of options) {
      if (needle && !option.label.toLocaleLowerCase('pt-BR').includes(needle)) continue;
      next.push(option);
    }
    if (allowEmpty && needle && !emptyLabel.toLocaleLowerCase('pt-BR').includes(needle)) {
      return next.slice(1);
    }
    return next;
  }, [allowEmpty, emptyLabel, options, query]);

  const sheet = open && !isDesktop && !insideDialog;
  const dialogPanel = open && !isDesktop && insideDialog;
  const popover = open && isDesktop;

  useLayoutEffect(() => {
    if (!open) return;
    const selectedIndex = rows.findIndex((row) => row.value === value);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : 0);
  }, [open, rows, value]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      searchRef.current?.focus({ preventScroll: true });
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [open, isDesktop, insideDialog]);

  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    const option = list?.querySelector<HTMLElement>(`[data-option-index="${String(activeIndex)}"]`);
    if (!list || !option) return;
    const listRect = list.getBoundingClientRect();
    const optionRect = option.getBoundingClientRect();
    if (optionRect.top < listRect.top) list.scrollTop -= listRect.top - optionRect.top;
    else if (optionRect.bottom > listRect.bottom) {
      list.scrollTop += optionRect.bottom - listRect.bottom;
    }
  }, [open, activeIndex, query]);

  useEffect(() => {
    if (!open || !isDesktop) return;
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (target instanceof Element && target.closest('[data-orcadom-panel]')) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      restoreFocusRef.current = true;
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open, isDesktop]);

  useEffect(() => {
    if (open || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus({ preventScroll: true });
  }, [open]);

  function dismiss(restoreFocus: boolean) {
    restoreFocusRef.current = restoreFocus;
    setOpen(false);
  }

  function toggle() {
    if (disabled) return;
    if (open) {
      dismiss(true);
      return;
    }
    const host = overlayHost(rootRef.current);
    setInsideDialog(Boolean(host && host !== document.body));
    setQuery('');
    setOpen(true);
  }

  function pick(id: string) {
    onChange(id);
    dismiss(true);
  }

  function onSearchKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (rows.length === 0) return;
      setActiveIndex((current) => Math.min(rows.length - 1, current + 1));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (rows.length === 0) return;
      setActiveIndex((current) => Math.max(0, current - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[activeIndex];
      if (row) pick(row.value);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    }
  }

  const body = (
    <ChoiceOptions
      className={popover ? '' : 'mt-3'}
      query={query}
      onQueryChange={setQuery}
      options={rows}
      activeIndex={activeIndex}
      value={value}
      onPick={pick}
      onActiveIndex={setActiveIndex}
      listId={listId}
      searchLabel={searchLabel}
      listLabel={title}
      searchRef={searchRef}
      listRef={listRef}
      onSearchKeyDown={onSearchKeyDown}
    />
  );

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        className={`${controlClass} flex items-center text-left ${className}${disabled ? ' opacity-40' : ''}`}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-disabled={disabled}
        disabled={disabled}
        onClick={toggle}
      >
        <span className="block min-w-0 flex-1 truncate text-left">{selected || emptyLabel}</span>
      </button>
      {sheet ? (
        <BottomSheet
          open
          title={title}
          onClose={() => {
            dismiss(true);
          }}
        >
          {body}
        </BottomSheet>
      ) : null}
      {dialogPanel ? (
        <InModalSheet
          open
          title={title}
          onClose={() => {
            dismiss(true);
          }}
        >
          {body}
        </InModalSheet>
      ) : null}
      {popover ? (
        <AnchoredPanel
          anchorRef={triggerRef}
          className="rounded-md border border-hairline bg-surface p-3 shadow-sm"
        >
          {body}
        </AnchoredPanel>
      ) : null}
    </div>
  );
}

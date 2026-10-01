'use client';

import {
  Fragment,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { AnchoredPanel } from '@/components/date-fields';
import { useHousehold } from '@/components/household-provider';
import { BottomSheet, controlClass } from '@/components/ui';
import { useMediaQuery } from '@/hooks/use-media-query';
import {
  categoryPath,
  filterCategoryRows,
  orderedCategoryRows,
  readRecentCategoryIds,
  rememberCategoryId,
  visibleRecentCategoryIds,
  writeRecentCategoryIds,
  type CategoryOption,
  type CategoryRow,
  type RecentCategoryStorage,
} from '@/lib/category-options';

export type { CategoryOption };
export { categoryPath };

const DESKTOP_CATEGORY_QUERY = '(min-width: 768px)';

type PickerRow = CategoryRow & { key: string; kind: 'empty' | 'recent' | 'tree' };

function optionDomId(listId: string, index: number) {
  return `${listId}-option-${String(index)}`;
}

function safeLocalStorage(): RecentCategoryStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function CategoryOptions({
  query,
  onQueryChange,
  rows,
  activeIndex,
  value,
  onPick,
  onActiveIndex,
  listId,
  searchRef,
  listRef,
  onSearchKeyDown,
  className = '',
}: {
  query: string;
  onQueryChange: (query: string) => void;
  rows: readonly PickerRow[];
  activeIndex: number;
  value: string;
  onPick: (id: string) => void;
  onActiveIndex: (index: number) => void;
  listId: string;
  searchRef: RefObject<HTMLInputElement | null>;
  listRef: RefObject<HTMLUListElement | null>;
  onSearchKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  className?: string;
}) {
  const firstRecent = rows.findIndex((row) => row.kind === 'recent');
  const hasTree = rows.some((row) => row.kind === 'tree');
  const activeId = rows[activeIndex] ? optionDomId(listId, activeIndex) : undefined;

  return (
    <div className={className}>
      <input
        ref={searchRef}
        className={controlClass}
        value={query}
        placeholder="Buscar categoria"
        aria-label="Buscar categoria"
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
        aria-label="Categorias"
        className="mt-2 max-h-60 overflow-y-auto overscroll-contain"
      >
        {rows.map((row, index) => {
          const selected = row.id === value;
          const active = index === activeIndex;
          return (
            <Fragment key={row.key}>
              {index === firstRecent ? (
                <li
                  role="presentation"
                  className="px-3 pt-2 pb-1 text-xs font-medium tracking-wide text-ink-faint uppercase"
                >
                  Recentes
                </li>
              ) : null}
              <li>
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
                  style={
                    row.kind === 'empty'
                      ? undefined
                      : { paddingLeft: `${String(12 + (row.depth - 1) * 12)}px` }
                  }
                  onMouseEnter={() => {
                    onActiveIndex(index);
                  }}
                  onPointerDown={(event) => {
                    event.preventDefault();
                  }}
                  onClick={() => {
                    onPick(row.id);
                  }}
                >
                  <span className="block truncate [direction:rtl]">
                    <span className="[direction:ltr]">{row.path}</span>
                  </span>
                </button>
              </li>
            </Fragment>
          );
        })}
        {hasTree ? null : (
          <li className="px-3 py-2 text-sm text-ink-soft">Nenhuma categoria encontrada.</li>
        )}
      </ul>
    </div>
  );
}

function CategoryDialogSheet({
  dialog,
  onClose,
  children,
}: {
  dialog: HTMLDialogElement;
  onClose: () => void;
  children: ReactNode;
}) {
  return createPortal(
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col rounded-t-lg border-t border-hairline bg-surface text-ink shadow-sm outline-none"
        style={{
          colorScheme: 'light',
          maxHeight: 'min(85dvh, calc(100dvh - env(safe-area-inset-top)))',
        }}
      >
        <button
          type="button"
          aria-label="Fechar"
          className="flex min-h-11 w-full shrink-0 items-center justify-center"
          onClick={onClose}
        >
          <span className="h-1 w-9 rounded-pill bg-hairline" aria-hidden />
        </button>
        <p className="px-5 font-display text-h2 font-medium">Categoria</p>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </>,
    dialog,
  );
}

export function CategorySelect({
  categories,
  value,
  onChange,
  emptyLabel = 'Selecione',
  allowEmpty = true,
}: {
  categories: readonly CategoryOption[];
  value: string;
  onChange: (categoryId: string) => void;
  emptyLabel?: string;
  allowEmpty?: boolean;
}) {
  const isDesktop = useMediaQuery(DESKTOP_CATEGORY_QUERY);
  const { household } = useHousehold();
  const householdId = household?.id ?? null;
  const [open, setOpen] = useState(false);
  const [insideDialog, setInsideDialog] = useState(false);
  const [query, setQuery] = useState('');
  const [storedIds, setStoredIds] = useState<string[]>([]);
  const [activeIndex, setActiveIndex] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const restoreFocusRef = useRef(false);
  const listId = useId();
  const selected = value ? categoryPath(categories, value) : '';
  const tree = useMemo(() => orderedCategoryRows(categories), [categories]);
  const knownIds = useMemo(() => new Set(categories.map((category) => category.id)), [categories]);
  const filtered = useMemo(() => filterCategoryRows(tree, query), [tree, query]);
  const recentIds = useMemo(
    () => (query.trim() || !householdId ? [] : visibleRecentCategoryIds(storedIds, knownIds)),
    [householdId, knownIds, query, storedIds],
  );
  const rows = useMemo(() => {
    const next: PickerRow[] = [];
    if (allowEmpty) next.push({ key: 'empty', kind: 'empty', id: '', path: emptyLabel, depth: 0 });
    for (const id of recentIds) {
      const row = tree.find((item) => item.id === id);
      if (!row) continue;
      next.push({ ...row, key: `recent-${id}`, kind: 'recent' });
    }
    for (const row of filtered) next.push({ ...row, key: `tree-${row.id}`, kind: 'tree' });
    return next;
  }, [allowEmpty, emptyLabel, filtered, recentIds, tree]);

  const sheet = open && !isDesktop && !insideDialog;
  const dialogPanel = open && !isDesktop && insideDialog;
  const popover = open && isDesktop;

  useEffect(() => {
    if (!householdId) {
      setStoredIds([]);
      return;
    }
    const storage = safeLocalStorage();
    if (!storage) return;
    try {
      const stored = readRecentCategoryIds(storage, householdId);
      const visible = visibleRecentCategoryIds(stored, knownIds);
      setStoredIds(visible);
      if (visible.length !== stored.length) writeRecentCategoryIds(storage, householdId, visible);
    } catch {
      setStoredIds([]);
    }
  }, [householdId, knownIds]);

  useLayoutEffect(() => {
    if (!open) return;
    const selectedIndex = rows.findIndex((row) => row.id === value);
    const fallback = rows.findIndex((row) => row.kind !== 'empty');
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(fallback, 0));
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
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
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
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      restoreFocusRef.current = true;
      setOpen(false);
    };
    dialog.addEventListener('cancel', onCancel);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
    };
  }, [open, insideDialog]);

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
    if (open) {
      dismiss(true);
      return;
    }
    const dialog = rootRef.current?.closest('dialog');
    dialogRef.current = dialog instanceof HTMLDialogElement && dialog.open ? dialog : null;
    setInsideDialog(dialogRef.current !== null);
    setQuery('');
    setOpen(true);
  }

  function pick(id: string) {
    onChange(id);
    if (householdId && id) {
      const storage = safeLocalStorage();
      if (storage) {
        try {
          const next = visibleRecentCategoryIds(
            rememberCategoryId(readRecentCategoryIds(storage, householdId), id),
            knownIds,
          );
          writeRecentCategoryIds(storage, householdId, next);
          setStoredIds(next);
        } catch {
          // O espaço pode bloquear o localStorage; a escolha segue sem recentes.
        }
      }
    }
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
      if (row) pick(row.id);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss(true);
    }
  }

  const options = (
    <CategoryOptions
      className={popover ? '' : 'mt-3'}
      query={query}
      onQueryChange={setQuery}
      rows={rows}
      activeIndex={activeIndex}
      value={value}
      onPick={pick}
      onActiveIndex={setActiveIndex}
      listId={listId}
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
        className={`${controlClass} flex items-center text-left`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={toggle}
      >
        <span className="block min-w-0 flex-1 truncate text-left [direction:rtl]">
          <span className="[direction:ltr]">{selected || emptyLabel}</span>
        </span>
      </button>
      {sheet ? (
        <BottomSheet
          open
          title="Categoria"
          onClose={() => {
            dismiss(true);
          }}
        >
          {options}
        </BottomSheet>
      ) : null}
      {dialogPanel && dialogRef.current ? (
        <CategoryDialogSheet
          dialog={dialogRef.current}
          onClose={() => {
            dismiss(true);
          }}
        >
          {options}
        </CategoryDialogSheet>
      ) : null}
      {popover ? (
        <AnchoredPanel
          anchorRef={triggerRef}
          className="rounded-md border border-hairline bg-surface p-3 shadow-sm"
        >
          {options}
        </AnchoredPanel>
      ) : null}
    </div>
  );
}

'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { controlClass } from '@/components/ui';

export interface CategoryOption {
  id: string;
  name: string;
  parentId: string | null;
  depth: number;
}

export function categoryPath(categories: readonly CategoryOption[], id: string): string {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const names: string[] = [];
  let current: string | null = id;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    const category = byId.get(current);
    if (!category) break;
    names.push(category.name);
    current = category.parentId;
  }
  return names.reverse().join(' › ');
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
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const selected = value ? categoryPath(categories, value) : '';
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    return categories
      .map((category) => ({ category, path: categoryPath(categories, category.id) }))
      .filter((option) => !needle || option.path.toLocaleLowerCase('pt-BR').includes(needle))
      .sort((left, right) => left.path.localeCompare(right.path, 'pt-BR'));
  }, [categories, query]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${controlClass} flex items-center text-left`}
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => {
          setOpen((current) => !current);
          setQuery('');
        }}
      >
        <span className="block min-w-0 flex-1 truncate text-left [direction:rtl]">
          <span className="[direction:ltr]">{selected || emptyLabel}</span>
        </span>
      </button>
      {open ? (
        <div className="mt-1 rounded-sm bg-surface-sunken p-2">
          <input
            className={controlClass}
            value={query}
            placeholder="Buscar categoria"
            aria-label="Buscar categoria"
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
          <ul id={listId} className="mt-2 max-h-60 overflow-y-auto" role="listbox">
            {allowEmpty ? (
              <li>
                <button
                  type="button"
                  className="min-h-11 w-full rounded-sm px-3 text-left text-sm hover:bg-surface"
                  onClick={() => {
                    onChange('');
                    setOpen(false);
                  }}
                >
                  {emptyLabel}
                </button>
              </li>
            ) : null}
            {options.map((option) => (
              <li key={option.category.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option.category.id === value}
                  className="min-h-11 w-full rounded-sm px-3 text-left text-sm hover:bg-surface"
                  style={{ paddingLeft: `${String(12 + (option.category.depth - 1) * 12)}px` }}
                  onClick={() => {
                    onChange(option.category.id);
                    setOpen(false);
                  }}
                >
                  <span className="block truncate [direction:rtl]">
                    <span className="[direction:ltr]">{option.path}</span>
                  </span>
                </button>
              </li>
            ))}
            {options.length === 0 ? (
              <li className="px-3 py-2 text-sm text-ink-soft">Nenhuma categoria encontrada.</li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  MAX_CATEGORY_DEPTH,
  assessCategoryPlacement,
  buildCategoryTree,
  createCategorySchema,
  updateCategorySchema,
  type CategoryTreeNode,
} from '@orcadom/types';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { CategorySelect } from '@/components/category-select';
import { ApiError, api } from '@/lib/api';
import { humanize } from '@/lib/format';
import type { Category } from '@/lib/models';
import {
  Button,
  CategoryChip,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
  StatusBadge,
  controlClass,
} from '@/components/ui';
import { colors } from '@/lib/tokens';

interface CategoryForm {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  color: string;
  parentId: string;
}

const emptyForm: CategoryForm = { name: '', type: 'EXPENSE', color: colors.brand, parentId: '' };

const MOVE_WARNING =
  'Mover esta categoria também muda orçamentos e relatórios de meses passados. Eles passam a usar a árvore atual.';

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const [editing, setEditing] = useState<Category | null>(null);
  const [lockedParent, setLockedParent] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const form = useForm<CategoryForm>({ defaultValues: emptyForm });
  const parentId = form.watch('parentId');
  const all = categories.data ?? [];

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setLockedParent(null);
    setError(null);
    form.reset(emptyForm);
  }

  function openCreate(parent?: Category) {
    setEditing(null);
    setLockedParent(parent ?? null);
    form.reset({
      ...emptyForm,
      type: parent?.type ?? 'EXPENSE',
      color: parent?.color ?? (parent?.type === 'INCOME' ? colors.income : colors.brand),
      parentId: parent?.id ?? '',
    });
    setError(null);
    setOpen(true);
  }

  const save = useMutation({
    mutationFn: async (values: CategoryForm) => {
      if (editing) {
        const parsed = updateCategorySchema.safeParse({
          name: values.name,
          color: values.color || null,
          parentId: values.parentId || null,
        });
        if (!parsed.success) {
          throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
        }
        return api(`/categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
      }
      const parsed = createCategorySchema.safeParse({
        name: values.name,
        type: lockedParent?.type ?? values.type,
        color: values.color || undefined,
        ...(lockedParent ? { parentId: lockedParent.id } : {}),
      });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      }
      return api('/categories', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeForm();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar a categoria.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      setPendingDelete(null);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir a categoria.');
      setPendingDelete(null);
    },
  });

  const income = buildCategoryTree(all.filter((category) => category.type === 'INCOME'));
  const expense = buildCategoryTree(all.filter((category) => category.type === 'EXPENSE'));
  const parentChoices = editing
    ? all.filter((candidate) => {
        if (candidate.type !== editing.type) return false;
        return assessCategoryPlacement(all, {
          id: editing.id,
          parentId: candidate.id,
          type: editing.type,
        }).ok;
      })
    : [];
  const moving = Boolean(editing) && (parentId || null) !== (editing?.parentId ?? null);

  return (
    <section>
      <PageHeader title="Categorias">
        <Button
          onClick={() => {
            openCreate();
          }}
        >
          Nova categoria
        </Button>
      </PageHeader>
      {error && !open ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {categories.isLoading ? <p className="mt-6 text-ink-soft">Carregando categorias…</p> : null}
      {categories.data?.length === 0 ? (
        <EmptyState title="Nenhuma categoria ainda">Crie uma de receita ou despesa.</EmptyState>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <CategoryColumn
          title="Receita"
          nodes={income}
          collapsed={collapsed}
          onToggle={(id) => {
            setCollapsed((current) => toggleSet(current, id));
          }}
          onAddChild={openCreate}
          onEdit={(category) => {
            setLockedParent(null);
            setEditing(category);
            form.reset({
              name: category.name,
              type: category.type,
              color: category.color ?? colors.income,
              parentId: category.parentId ?? '',
            });
            setError(null);
            setOpen(true);
          }}
          onDelete={(category) => {
            setError(null);
            setPendingDelete(category);
          }}
        />
        <CategoryColumn
          title="Despesa"
          nodes={expense}
          collapsed={collapsed}
          onToggle={(id) => {
            setCollapsed((current) => toggleSet(current, id));
          }}
          onAddChild={openCreate}
          onEdit={(category) => {
            setLockedParent(null);
            setEditing(category);
            form.reset({
              name: category.name,
              type: category.type,
              color: category.color ?? colors.expense,
              parentId: category.parentId ?? '',
            });
            setError(null);
            setOpen(true);
          }}
          onDelete={(category) => {
            setError(null);
            setPendingDelete(category);
          }}
        />
      </div>

      <Modal
        open={open}
        title={lockedParent ? 'Nova subcategoria' : editing ? 'Editar categoria' : 'Nova categoria'}
        onClose={closeForm}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              save.mutate(values);
            })(event);
          }}
        >
          {error ? <Notice>{error}</Notice> : null}
          {moving ? <Notice>{MOVE_WARNING}</Notice> : null}
          {lockedParent ? (
            <p className="text-sm text-ink-soft">Subcategoria de {lockedParent.name}.</p>
          ) : null}
          <Field label="Nome">
            <input className={controlClass} {...form.register('name')} />
          </Field>
          {editing || lockedParent ? (
            <p className="text-sm text-ink-soft">
              O tipo permanece {(lockedParent ?? editing)?.type === 'INCOME' ? 'receita' : 'despesa'}.
            </p>
          ) : (
            <Field label="Tipo">
              <Select {...form.register('type')}>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </Select>
            </Field>
          )}
          {editing ? (
            <Field label="Categoria pai">
              <CategorySelect
                categories={parentChoices}
                value={parentId}
                emptyLabel="Nenhuma (raiz)"
                onChange={(next) => {
                  form.setValue('parentId', next, { shouldDirty: true });
                }}
              />
            </Field>
          ) : null}
          <Field label="Cor">
            <input
              type="color"
              className="h-10 w-16 rounded-sm bg-surface-sunken"
              {...form.register('color')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title="Excluir categoria"
        onClose={() => {
          setPendingDelete(null);
        }}
      >
        <p className="text-sm text-ink-soft">
          Excluir {pendingDelete?.name}? Não é possível excluir se houver subcategorias ou se a
          categoria estiver em uso.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPendingDelete(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={remove.isPending}
            onClick={() => {
              if (pendingDelete) remove.mutate(pendingDelete.id);
            }}
          >
            {remove.isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function CategoryColumn({
  title,
  nodes,
  collapsed,
  onToggle,
  onAddChild,
  onEdit,
  onDelete,
}: {
  title: string;
  nodes: CategoryTreeNode<Category>[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onAddChild: (category: Category) => void;
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <section className="rounded-lg bg-surface p-6">
      <h2 className="font-display text-h2 font-medium">{title}</h2>
      {nodes.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nenhuma categoria deste tipo.</p>
      ) : (
        <ul className="mt-4 space-y-3">{nodes.map((node) => renderNode(node))}</ul>
      )}
    </section>
  );

  function renderNode(node: CategoryTreeNode<Category>): ReactNode {
    const category = node.item;
    const hasChildren = node.children.length > 0;
    const hidden = collapsed.has(category.id);
    return (
      <li key={category.id}>
        <div
          className="flex flex-wrap items-center justify-between gap-3"
          style={{ paddingLeft: `${String((node.depth - 1) * 16)}px` }}
        >
          <span className="flex min-w-0 items-center gap-2">
            {hasChildren ? (
              <button
                type="button"
                className="inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink-soft hover:bg-surface-sunken"
                aria-expanded={!hidden}
                aria-label={hidden ? `Expandir ${category.name}` : `Recolher ${category.name}`}
                onClick={() => {
                  onToggle(category.id);
                }}
              >
                {hidden ? '▸' : '▾'}
              </button>
            ) : (
              <span className="inline-flex size-11 shrink-0" aria-hidden />
            )}
            <CategoryChip name={category.name} color={category.color} />
            {category.isSystem ? <StatusBadge tone="neutral">Sistema</StatusBadge> : null}
          </span>
          <span className="flex flex-wrap gap-2">
            {node.depth < MAX_CATEGORY_DEPTH ? (
              <Button
                variant="secondary"
                onClick={() => {
                  onAddChild(category);
                }}
              >
                Adicionar subcategoria
              </Button>
            ) : null}
            {category.isSystem ? null : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    onEdit(category);
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    onDelete(category);
                  }}
                >
                  Excluir
                </Button>
              </>
            )}
          </span>
        </div>
        {hasChildren && !hidden ? (
          <ul className="mt-3 space-y-3">{node.children.map((child) => renderNode(child))}</ul>
        ) : null}
      </li>
    );
  }
}

function toggleSet(current: Set<string>, id: string): Set<string> {
  const next = new Set(current);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

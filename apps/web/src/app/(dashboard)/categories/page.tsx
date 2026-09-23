'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createCategorySchema, updateCategorySchema } from '@orcadom/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '@/lib/api';
import { humanize } from '@/lib/format';
import type { Category } from '@/lib/models';
import { Button, CategoryChip, Field, Modal, Notice, Select, controlClass } from '@/components/ui';

interface CategoryForm {
  name: string;
  type: 'INCOME' | 'EXPENSE';
  color: string;
}

const emptyForm: CategoryForm = { name: '', type: 'EXPENSE', color: '#0d6e63' };

export default function CategoriesPage() {
  const queryClient = useQueryClient();
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const [editing, setEditing] = useState<Category | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Category | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<CategoryForm>({ defaultValues: emptyForm });

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setError(null);
    form.reset(emptyForm);
  }

  const save = useMutation({
    mutationFn: async (values: CategoryForm) => {
      if (editing) {
        const parsed = updateCategorySchema.safeParse({
          name: values.name,
          color: values.color || null,
        });
        if (!parsed.success)
          throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
        return api(`/categories/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
      }
      const parsed = createCategorySchema.safeParse({
        name: values.name,
        type: values.type,
        color: values.color || undefined,
      });
      if (!parsed.success)
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      return api('/categories', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      closeForm();
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível salvar a categoria.',
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/categories/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['categories'] });
      setPendingDelete(null);
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível excluir a categoria.',
      );
      setPendingDelete(null);
    },
  });

  const income = categories.data?.filter((category) => category.type === 'INCOME') ?? [];
  const expense = categories.data?.filter((category) => category.type === 'EXPENSE') ?? [];

  return (
    <section>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-display text-[28px] font-semibold">Categorias</h1>
        <Button
          onClick={() => {
            setEditing(null);
            form.reset(emptyForm);
            setError(null);
            setOpen(true);
          }}
        >
          Nova categoria
        </Button>
      </div>
      {error && !open ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {categories.isLoading ? <p className="mt-6 text-ink-soft">Carregando categorias…</p> : null}
      {categories.data?.length === 0 ? (
        <p className="mt-6 rounded-lg bg-surface p-6 text-ink-soft">
          Nenhuma categoria ainda. Crie uma de receita ou despesa.
        </p>
      ) : null}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <CategoryColumn
          title="Receita"
          items={income}
          onEdit={(category) => {
            setEditing(category);
            form.reset({
              name: category.name,
              type: category.type,
              color: category.color ?? '#2f7d5a',
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
          items={expense}
          onEdit={(category) => {
            setEditing(category);
            form.reset({
              name: category.name,
              type: category.type,
              color: category.color ?? '#c4462f',
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
        title={editing ? 'Editar categoria' : 'Nova categoria'}
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
          <Field label="Nome">
            <input className={controlClass} {...form.register('name')} />
          </Field>
          {editing ? (
            <p className="text-sm text-ink-soft">
              O tipo permanece {editing.type === 'INCOME' ? 'receita' : 'despesa'}.
            </p>
          ) : (
            <Field label="Tipo">
              <Select {...form.register('type')}>
                <option value="INCOME">Receita</option>
                <option value="EXPENSE">Despesa</option>
              </Select>
            </Field>
          )}
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
          Excluir {pendingDelete?.name}? Categorias usadas em lançamentos permanecem.
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
  items,
  onEdit,
  onDelete,
}: {
  title: string;
  items: Category[];
  onEdit: (category: Category) => void;
  onDelete: (category: Category) => void;
}) {
  return (
    <section className="rounded-lg bg-surface p-6">
      <h2 className="font-display text-[21px] font-medium">{title}</h2>
      {items.length === 0 ? (
        <p className="mt-4 text-sm text-ink-soft">Nenhuma categoria deste tipo.</p>
      ) : null}
      <ul className="mt-4 space-y-3">
        {items.map((category) => (
          <li key={category.id} className="flex items-center justify-between gap-3">
            <CategoryChip name={category.name} color={category.color} />
            <span className="flex gap-2">
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
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBudgetSchema, updateBudgetSchema } from '@orcadom/types';
import { useState } from 'react';
import { BudgetProgressBar, Button, CategoryChip, Notice, controlClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { currentMonth, humanize } from '@/lib/format';
import type { BudgetList, BudgetProgress, Category } from '@/lib/models';

export default function BudgetsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const viewingCurrent = month === currentMonth();
  const [error, setError] = useState<string | null>(null);
  const categories = useQuery({
    queryKey: ['categories', 'EXPENSE'],
    queryFn: () => api<Category[]>('/categories?type=EXPENSE'),
  });
  const budgets = useQuery({
    queryKey: ['budgets', month],
    queryFn: () => api<BudgetList>(`/budgets?month=${month}`),
  });
  const byCategory = new Map((budgets.data?.budgets ?? []).map((item) => [item.categoryId, item]));

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async ({
      categoryId,
      budgetId,
      amount,
    }: {
      categoryId: string;
      budgetId?: string;
      amount: number;
    }) => {
      if (budgetId) {
        const parsed = updateBudgetSchema.safeParse({ amount });
        if (!parsed.success) {
          throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
        }
        return api(`/budgets/${budgetId}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
      }
      const parsed = createBudgetSchema.safeParse({ categoryId, amount });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      }
      return api('/budgets', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar o orçamento.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/budgets/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível encerrar o orçamento.');
    },
  });

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold">Orçamentos</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Limite mensal por categoria de despesa. Alterar o valor vale a partir deste mês e não
            muda o histórico.
          </p>
        </div>
        <label className="text-sm text-ink-soft">
          Mês
          <input
            type="month"
            value={month}
            onChange={(event) => {
              setMonth(event.target.value);
            }}
            className={`${controlClass} mt-1`}
          />
        </label>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {categories.isLoading || budgets.isLoading ? (
        <p className="mt-6 text-ink-soft">Carregando orçamentos…</p>
      ) : null}
      {categories.data?.length === 0 ? (
        <p className="mt-6 rounded-lg bg-surface p-6 text-ink-soft">
          Crie uma categoria de despesa para definir um limite.
        </p>
      ) : null}

      <ul className="mt-6 space-y-4">
        {(categories.data ?? []).map((category) => (
          <BudgetRow
            key={`${category.id}-${byCategory.get(category.id)?.id ?? 'new'}-${byCategory.get(category.id)?.limit ?? ''}`}
            category={category}
            budget={byCategory.get(category.id)}
            editable={viewingCurrent}
            pending={save.isPending || remove.isPending}
            onSave={(amount) => {
              const current = byCategory.get(category.id);
              save.mutate({ categoryId: category.id, budgetId: current?.id, amount });
            }}
            onRemove={() => {
              const current = byCategory.get(category.id);
              if (current) remove.mutate(current.id);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function BudgetRow({
  category,
  budget,
  editable,
  pending,
  onSave,
  onRemove,
}: {
  category: Category;
  budget: BudgetProgress | undefined;
  editable: boolean;
  pending: boolean;
  onSave: (amount: number) => void;
  onRemove: () => void;
}) {
  const [amount, setAmount] = useState(budget?.limit ?? '');
  const parsed = Number(amount);

  return (
    <li className="rounded-lg bg-surface p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <CategoryChip name={category.name} color={category.color} />
        {budget && editable ? (
          <Button variant="ghost" disabled={pending} onClick={onRemove}>
            Encerrar
          </Button>
        ) : null}
      </div>
      {budget ? (
        <div className="mt-4">
          <BudgetProgressBar
            spent={budget.spent}
            limit={budget.limit}
            ratio={budget.ratio}
            status={budget.status}
          />
        </div>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">Nenhum limite definido para este mês.</p>
      )}
      {editable ? (
      <form
        className="mt-4 flex flex-wrap items-end gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (Number.isFinite(parsed) && parsed > 0) onSave(parsed);
        }}
      >
        <label className="min-w-40 flex-1 text-sm text-ink-soft">
          Limite mensal
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(event) => {
              setAmount(event.target.value);
            }}
            className={`${controlClass} mt-1 tabular-nums`}
          />
        </label>
        <Button type="submit" disabled={pending || !(parsed > 0)}>
          {budget ? 'Atualizar' : 'Definir limite'}
        </Button>
      </form>
      ) : (
        <p className="mt-4 text-sm text-ink-soft">
          O histórico não é editável. Volte ao mês atual para mudar o limite.
        </p>
      )}
    </li>
  );
}

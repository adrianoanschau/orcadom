'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRecurringTransactionSchema, updateRecurringTransactionSchema } from '@orcadom/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Field, Modal, Notice, Select, controlClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { dateToNoonIso, formatDate, formatMoney, humanize, todayInput } from '@/lib/format';
import { recurrenceFrequencyLabels, transactionTypeLabels } from '@/lib/labels';
import type { Account, Category, RecurrenceFrequency, RecurringTransaction } from '@/lib/models';

interface RecurringForm {
  description: string;
  amount: string;
  type: 'INCOME' | 'EXPENSE';
  frequency: RecurrenceFrequency;
  dayOfMonth: string;
  startDate: string;
  endDate: string;
  accountId: string;
  categoryId: string;
}

const emptyForm: RecurringForm = {
  description: '',
  amount: '',
  type: 'EXPENSE',
  frequency: 'MONTHLY',
  dayOfMonth: '1',
  startDate: todayInput(),
  endDate: '',
  accountId: '',
  categoryId: '',
};

export default function RecurringPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RecurringTransaction | null>(null);
  const [pendingDelete, setPendingDelete] = useState<RecurringTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RecurringForm>({ defaultValues: emptyForm });
  const type = form.watch('type');
  const frequency = form.watch('frequency');

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const items = useQuery({
    queryKey: ['recurring-transactions'],
    queryFn: () => api<RecurringTransaction[]>('/recurring-transactions'),
  });
  const visibleCategories = (categories.data ?? []).filter((category) => category.type === type);

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setError(null);
    form.reset({ ...emptyForm, startDate: todayInput() });
  }

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async (values: RecurringForm) => {
      if (editing) {
        const parsed = updateRecurringTransactionSchema.safeParse({
          description: values.description,
          amount: Number(values.amount),
          frequency: values.frequency,
          dayOfMonth: values.frequency === 'MONTHLY' ? Number(values.dayOfMonth) : null,
          endDate: values.endDate ? dateToNoonIso(values.endDate) : null,
          accountId: values.accountId || undefined,
          categoryId: values.categoryId || undefined,
        });
        if (!parsed.success) {
          throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
        }
        return api(`/recurring-transactions/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
      }
      const parsed = createRecurringTransactionSchema.safeParse({
        description: values.description,
        amount: Number(values.amount),
        type: values.type,
        frequency: values.frequency,
        dayOfMonth: values.frequency === 'MONTHLY' ? Number(values.dayOfMonth) : undefined,
        startDate: dateToNoonIso(values.startDate),
        endDate: values.endDate ? dateToNoonIso(values.endDate) : undefined,
        accountId: values.accountId || undefined,
        categoryId: values.categoryId || undefined,
      });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      }
      return api('/recurring-transactions', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      setError(null);
      closeForm();
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar a recorrência.');
    },
  });

  const toggle = useMutation({
    mutationFn: (item: RecurringTransaction) =>
      api(`/recurring-transactions/${item.id}/${item.active ? 'pause' : 'resume'}`, {
        method: 'PATCH',
      }),
    onSuccess: async () => {
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível atualizar a recorrência.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/recurring-transactions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setPendingDelete(null);
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setPendingDelete(null);
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir a recorrência.');
    },
  });

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold">Recorrentes</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Aluguel, assinatura, salário. O sistema gera cada ocorrência sozinho.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditing(null);
            form.reset({ ...emptyForm, startDate: todayInput() });
            setError(null);
            setOpen(true);
          }}
        >
          Nova recorrência
        </Button>
      </div>
      {error && !open ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {items.isLoading ? <p className="mt-6 text-ink-soft">Carregando recorrências…</p> : null}
      {items.data?.length === 0 ? (
        <p className="mt-6 rounded-lg bg-surface p-6 text-ink-soft">
          Nenhuma recorrência ainda. Cadastre um lançamento que se repete.
        </p>
      ) : null}
      <ul className="mt-6 space-y-4">
        {(items.data ?? []).map((item) => (
          <li key={item.id} className="rounded-lg bg-surface p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-[21px] font-medium">{item.description}</h2>
                <p className="mt-1 text-sm text-ink-soft">
                  {transactionTypeLabels[item.type]} · {recurrenceFrequencyLabels[item.frequency]}
                  {item.frequency === 'MONTHLY' && item.dayOfMonth
                    ? ` · dia ${String(item.dayOfMonth)}`
                    : ''}{' '}
                  · {item.accountName}
                  {item.categoryName ? ` · ${item.categoryName}` : ''}
                </p>
                <p className="mt-2 text-lg font-bold tabular-nums text-ink">
                  {formatMoney(item.amount)}
                </p>
                <p className="mt-1 text-sm text-ink-soft">
                  {item.active
                    ? item.nextOccurrence
                      ? `Próxima: ${formatDate(item.nextOccurrence)}`
                      : 'Sem próxima ocorrência'
                    : 'Pausada'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setEditing(item);
                    form.reset({
                      description: item.description,
                      amount: item.amount,
                      type: item.type,
                      frequency: item.frequency,
                      dayOfMonth: String(item.dayOfMonth ?? 1),
                      startDate: item.startDate.slice(0, 10),
                      endDate: item.endDate ? item.endDate.slice(0, 10) : '',
                      accountId: item.accountId,
                      categoryId: item.categoryId ?? '',
                    });
                    setError(null);
                    setOpen(true);
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="secondary"
                  disabled={toggle.isPending}
                  onClick={() => {
                    toggle.mutate(item);
                  }}
                >
                  {item.active ? 'Pausar' : 'Retomar'}
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPendingDelete(item);
                  }}
                >
                  Excluir
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <Modal
        open={open}
        title={editing ? 'Editar recorrência' : 'Nova recorrência'}
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
          {editing ? (
            <p className="text-sm text-ink-soft">
              A alteração vale a partir da próxima ocorrência. As já geradas não mudam.
            </p>
          ) : null}
          <Field label="Descrição">
            <input className={controlClass} {...form.register('description')} />
          </Field>
          <Field label="Valor">
            <input
              type="number"
              min="0.01"
              step="0.01"
              className={`${controlClass} tabular-nums`}
              {...form.register('amount')}
            />
          </Field>
          {editing ? (
            <p className="text-sm text-ink-soft">
              O tipo permanece {editing.type === 'INCOME' ? 'receita' : 'despesa'}.
            </p>
          ) : (
            <Field label="Tipo">
              <Select {...form.register('type')}>
                <option value="EXPENSE">Despesa</option>
                <option value="INCOME">Receita</option>
              </Select>
            </Field>
          )}
          <Field label="Frequência">
            <Select {...form.register('frequency')}>
              {Object.entries(recurrenceFrequencyLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          {frequency === 'MONTHLY' ? (
            <Field label="Dia do mês">
              <input
                type="number"
                min="1"
                max="31"
                className={`${controlClass} tabular-nums`}
                {...form.register('dayOfMonth')}
              />
            </Field>
          ) : null}
          {editing ? null : (
            <Field label="Início">
              <input type="date" className={controlClass} {...form.register('startDate')} />
            </Field>
          )}
          <Field label="Fim (opcional)">
            <input type="date" className={controlClass} {...form.register('endDate')} />
          </Field>
          <Field label="Conta">
            <Select {...form.register('accountId')}>
              <option value="">Selecione</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Categoria">
            <Select {...form.register('categoryId')}>
              <option value="">Selecione</option>
              {visibleCategories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
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
        title="Excluir recorrência"
        onClose={() => {
          setPendingDelete(null);
        }}
      >
        <p className="text-sm text-ink-soft">
          Excluir {pendingDelete?.description}? Ocorrências já lançadas ficam no extrato; as
          agendadas somem.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPendingDelete(null);
            }}
          >
            Voltar
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

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createTransactionSchema } from '@orcadom/types';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '@/lib/api';
import { dateToNoonIso, formatDate, humanize, todayInput } from '@/lib/format';
import { transactionTypeLabels, type TransactionType } from '@/lib/labels';
import type { Account, Category, Transaction, TransactionPage } from '@/lib/models';
import {
  Button,
  Field,
  Modal,
  Notice,
  Select,
  TransactionRow,
  controlClass,
} from '@/components/ui';

interface Filters {
  accountId: string;
  categoryId: string;
  from: string;
  to: string;
  page: number;
}

interface TransactionForm {
  description: string;
  amount: string;
  type: TransactionType;
  date: string;
  accountId: string;
  categoryId: string;
  fromAccountId: string;
  toAccountId: string;
}

const emptyFilters: Filters = { accountId: '', categoryId: '', from: '', to: '', page: 1 };

function filtersFromAccount(accountId: string): Filters {
  return { ...emptyFilters, accountId };
}
const emptyForm: TransactionForm = {
  description: '',
  amount: '',
  type: 'EXPENSE',
  date: todayInput(),
  accountId: '',
  categoryId: '',
  fromAccountId: '',
  toAccountId: '',
};

export default function TransactionsPage() {
  const queryClient = useQueryClient();
  const searchParams = useSearchParams();
  const accountFromUrl = searchParams.get('accountId') ?? '';
  const [filters, setFilters] = useState<Filters>(() => filtersFromAccount(accountFromUrl));
  const [draft, setDraft] = useState<Filters>(() => filtersFromAccount(accountFromUrl));
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Transaction | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TransactionForm>({ defaultValues: emptyForm });
  const type = form.watch('type');

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const transactions = useQuery({
    queryKey: ['transactions', filters],
    queryFn: () => api<TransactionPage>(`/transactions?${toQuery(filters)}`),
  });

  const names = new Map((accounts.data ?? []).map((account) => [account.id, account.name]));
  const categoryNames = new Map(
    (categories.data ?? []).map((category) => [category.id, category.name]),
  );
  const visibleCategories = (categories.data ?? []).filter((category) => category.type === type);

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setError(null);
    form.reset(emptyForm);
  }

  const save = useMutation({
    mutationFn: async (values: TransactionForm) => {
      const transfer = values.type === 'TRANSFER';
      const parsed = createTransactionSchema.safeParse({
        description: values.description,
        amount: Number(values.amount),
        type: values.type,
        date: dateToNoonIso(values.date),
        accountId: transfer ? undefined : values.accountId || undefined,
        categoryId: transfer ? undefined : values.categoryId || undefined,
        fromAccountId: transfer ? values.fromAccountId || undefined : undefined,
        toAccountId: transfer ? values.toAccountId || undefined : undefined,
      });
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new ApiError(humanize(issue?.message ?? 'Valor inválido.'), 400);
      }
      const path = editing ? `/transactions/${editing.id}` : '/transactions';
      return api(path, { method: editing ? 'PATCH' : 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      closeForm();
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível salvar o lançamento.',
      );
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/transactions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setPendingDelete(null);
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível excluir o lançamento.',
      );
      setPendingDelete(null);
    },
  });

  const totalPages = Math.max(
    1,
    Math.ceil((transactions.data?.total ?? 0) / (transactions.data?.limit ?? 20)),
  );

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[28px] font-semibold">Lançamentos</h1>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/imports"
            className="inline-flex items-center justify-center rounded-pill border border-hairline bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-surface-sunken"
          >
            Importar extrato
          </Link>
          <Button
            onClick={() => {
              setEditing(null);
              form.reset({ ...emptyForm, date: todayInput() });
              setError(null);
              setOpen(true);
            }}
          >
            Novo lançamento
          </Button>
        </div>
      </div>

      <form
        className="mt-6 grid gap-3 rounded-lg bg-surface p-4 md:grid-cols-5"
        onSubmit={(event) => {
          event.preventDefault();
          setFilters({ ...draft, page: 1 });
        }}
      >
        <Field label="Conta">
          <Select
            value={draft.accountId}
            onChange={(event) => {
              setDraft({ ...draft, accountId: event.target.value });
            }}
          >
            <option value="">Todas</option>
            {accounts.data?.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Categoria">
          <Select
            value={draft.categoryId}
            onChange={(event) => {
              setDraft({ ...draft, categoryId: event.target.value });
            }}
          >
            <option value="">Todas</option>
            {categories.data?.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="De">
          <input
            type="date"
            className={controlClass}
            value={draft.from}
            onChange={(event) => {
              setDraft({ ...draft, from: event.target.value });
            }}
          />
        </Field>
        <Field label="Até">
          <input
            type="date"
            className={controlClass}
            value={draft.to}
            onChange={(event) => {
              setDraft({ ...draft, to: event.target.value });
            }}
          />
        </Field>
        <div className="flex items-end">
          <Button type="submit" className="w-full">
            Filtrar
          </Button>
        </div>
      </form>

      {error && !open ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {transactions.isLoading ? (
        <p className="mt-6 text-ink-soft">Carregando lançamentos…</p>
      ) : null}
      {transactions.data?.data.length === 0 ? (
        <p className="mt-6 rounded-lg bg-surface p-6 text-ink-soft">
          Nenhum lançamento neste filtro.
        </p>
      ) : null}
      <ul className="mt-4 rounded-lg bg-surface px-4">
        {transactions.data?.data.map((transaction) => (
          <TransactionRow
            key={transaction.id}
            description={transaction.description}
            type={transaction.type}
            amount={transaction.amount}
            meta={metaFor(transaction, names, categoryNames)}
          >
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(transaction);
                form.reset({
                  description: transaction.description,
                  amount: transaction.amount,
                  type: transaction.type,
                  date: transaction.date.slice(0, 10),
                  accountId: transaction.accountId ?? '',
                  categoryId: transaction.categoryId ?? '',
                  fromAccountId: transaction.fromAccountId ?? '',
                  toAccountId: transaction.toAccountId ?? '',
                });
                setError(null);
                setOpen(true);
              }}
            >
              Editar
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setPendingDelete(transaction);
              }}
            >
              Excluir
            </Button>
          </TransactionRow>
        ))}
      </ul>
      {transactions.data && transactions.data.total > transactions.data.limit ? (
        <div className="mt-4 flex items-center justify-between text-sm text-ink-soft">
          <span>
            Página {transactions.data.page} de {totalPages}
          </span>
          <span className="flex gap-2">
            <Button
              variant="secondary"
              disabled={filters.page <= 1}
              onClick={() => {
                setFilters({ ...filters, page: filters.page - 1 });
              }}
            >
              Anterior
            </Button>
            <Button
              variant="secondary"
              disabled={filters.page >= totalPages}
              onClick={() => {
                setFilters({ ...filters, page: filters.page + 1 });
              }}
            >
              Próxima
            </Button>
          </span>
        </div>
      ) : null}

      <Modal
        open={open}
        title={editing ? 'Editar lançamento' : 'Novo lançamento'}
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
          <Field label="Tipo">
            <Select {...form.register('type')}>
              {Object.entries(transactionTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Data">
            <input type="date" className={controlClass} {...form.register('date')} />
          </Field>
          {type === 'TRANSFER' ? (
            <>
              <Field label="Conta de origem">
                <Select {...form.register('fromAccountId')}>
                  <option value="">Selecione</option>
                  {accounts.data?.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Conta de destino">
                <Select {...form.register('toAccountId')}>
                  <option value="">Selecione</option>
                  {accounts.data?.map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          ) : (
            <>
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
            </>
          )}
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
        title="Excluir lançamento"
        onClose={() => {
          setPendingDelete(null);
        }}
      >
        <p className="text-sm text-ink-soft">
          Excluir {pendingDelete?.description}? O saldo das contas é recalculado.
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

function toQuery(filters: Filters) {
  const params = new URLSearchParams({ page: String(filters.page), limit: '20' });
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.from) params.set('from', `${filters.from}T00:00:00.000Z`);
  if (filters.to) params.set('to', `${filters.to}T23:59:59.999Z`);
  return params.toString();
}

function metaFor(
  transaction: Transaction,
  accounts: Map<string, string>,
  categories: Map<string, string>,
) {
  const date = formatDate(transaction.date);
  if (transaction.type === 'TRANSFER') {
    const from = accounts.get(transaction.fromAccountId ?? '') ?? 'origem';
    const to = accounts.get(transaction.toAccountId ?? '') ?? 'destino';
    return `${date} · ${from} → ${to}`;
  }
  const account = accounts.get(transaction.accountId ?? '') ?? 'conta';
  const category = categories.get(transaction.categoryId ?? '') ?? 'categoria';
  return `${date} · ${account} · ${category}`;
}

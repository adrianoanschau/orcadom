'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createBillSchema, createRecurringTransactionSchema, payBillSchema } from '@orcadom/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { CategorySelect } from '@/components/category-select';
import { ChoiceSelect } from '@/components/choice-select';
import { DateInput, MonthInput } from '@/components/date-fields';
import {
  Button,
  CategoryChip,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
  ProgressBar,
  StatusBadge,
  controlClass,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { currentMonth, dateToNoonIso, formatDate, formatMoney, humanize, todayInput } from '@/lib/format';
import type { Account, BillItem, BillMatchCandidate, Category } from '@/lib/models';

interface BillForm {
  description: string;
  amount: string;
  dueDate: string;
  accountId: string;
  categoryId: string;
  card: boolean;
  targetAccountId: string;
  repeats: boolean;
}

interface PayForm {
  amount: string;
  date: string;
  accountId: string;
  categoryId: string;
}

const emptyForm: BillForm = {
  description: '',
  amount: '',
  dueDate: todayInput(),
  accountId: '',
  categoryId: '',
  card: false,
  targetAccountId: '',
  repeats: false,
};

export default function BillsPage() {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(currentMonth);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<BillItem | null>(null);
  const [paying, setPaying] = useState<BillItem | null>(null);
  const [unpaying, setUnpaying] = useState<BillItem | null>(null);
  const [showCanceled, setShowCanceled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<BillForm>({ defaultValues: emptyForm });
  const payForm = useForm<PayForm>({ defaultValues: { amount: '', date: todayInput(), accountId: '', categoryId: '' } });
  const card = form.watch('card');
  const repeats = form.watch('repeats');
  const includeOverdue = month === currentMonth();

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const bills = useQuery({
    queryKey: ['bills', month, includeOverdue, showCanceled],
    queryFn: () =>
      api<BillItem[]>(
        `/bills?month=${month}&includeOverdue=${includeOverdue ? 'true' : 'false'}&includeCanceled=${showCanceled ? 'true' : 'false'}`,
      ),
  });
  const candidates = useQuery({
    queryKey: ['bills', paying?.id, 'matches'],
    queryFn: () => api<BillMatchCandidate[]>(`/bills/${paying?.id ?? ''}/match-candidates`),
    enabled: Boolean(paying),
  });

  const expenseCategories = (categories.data ?? []).filter((category) => category.type === 'EXPENSE');
  const cards = (accounts.data ?? []).filter((account) => account.type === 'CREDIT_CARD');
  const rows = bills.data ?? [];
  const overdue = rows.filter((row) => row.display.label === 'Atrasada');
  const openRows = rows.filter((row) => row.status === 'PENDING' && row.display.label !== 'Atrasada');
  const paid = rows.filter((row) => row.status === 'PAID');
  const canceled = rows.filter((row) => row.status === 'CANCELED');
  const paidCount = paid.length;
  const total = rows.filter((row) => row.status !== 'CANCELED').length;
  const remaining = rows
    .filter((row) => row.status === 'PENDING')
    .reduce((sum, row) => sum + Number(row.amount), 0);
  const highMatch = (candidates.data ?? []).filter((item) => item.matchConfidence === 'high');
  const lowMatches = (candidates.data ?? []).filter((item) => item.matchConfidence === 'low');
  const suggested = highMatch.length === 1 ? highMatch[0] : null;

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['bills'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['recurring-transactions'] }),
    ]);
  }

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setError(null);
    form.reset({ ...emptyForm, dueDate: todayInput() });
  }

  function openPay(bill: BillItem) {
    setPaying(bill);
    setError(null);
    payForm.reset({
      amount: bill.amount,
      date: todayInput(),
      accountId: bill.accountId ?? '',
      categoryId: bill.categoryId ?? '',
    });
  }

  const save = useMutation({
    mutationFn: async (values: BillForm) => {
      if (values.repeats && !editing) {
        const parsed = createRecurringTransactionSchema.safeParse({
          description: values.description,
          amount: Number(values.amount),
          type: 'EXPENSE',
          frequency: 'MONTHLY',
          dayOfMonth: Number(values.dueDate.slice(8, 10)),
          startDate: dateToNoonIso(values.dueDate),
          accountId: values.accountId || undefined,
          categoryId: values.card ? undefined : values.categoryId || undefined,
          mode: 'BILL',
          targetAccountId: values.card ? values.targetAccountId || undefined : undefined,
        });
        if (!parsed.success) throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
        return api('/recurring-transactions', { method: 'POST', body: JSON.stringify(parsed.data) });
      }
      const payload = {
        description: values.description,
        amount: Number(values.amount),
        dueDate: values.dueDate,
        accountId: values.accountId || undefined,
        categoryId: values.card ? undefined : values.categoryId || undefined,
        targetAccountId: values.card ? values.targetAccountId || undefined : undefined,
      };
      const parsed = createBillSchema.safeParse(payload);
      if (!parsed.success) throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      if (editing) {
        return api(`/bills/${editing.id}`, { method: 'PATCH', body: JSON.stringify(parsed.data) });
      }
      return api('/bills', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      closeForm();
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar a conta.');
    },
  });

  const pay = useMutation({
    mutationFn: async (values: PayForm) => {
      if (!paying) return;
      const parsed = payBillSchema.safeParse({
        accountId: values.accountId,
        amount: Number(values.amount),
        date: dateToNoonIso(values.date),
        categoryId: paying.targetAccountId ? undefined : values.categoryId || undefined,
      });
      if (!parsed.success) throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      return api(`/bills/${paying.id}/pay`, { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      setPaying(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível marcar como paga.');
    },
  });

  const link = useMutation({
    mutationFn: async (transactionId: string) => {
      if (!paying) return;
      return api(`/bills/${paying.id}/link-transaction`, {
        method: 'POST',
        body: JSON.stringify({ transactionId }),
      });
    },
    onSuccess: async () => {
      setPaying(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível vincular o lançamento.');
    },
  });

  const unpay = useMutation({
    mutationFn: async (bill: BillItem) => {
      await api(`/bills/${bill.id}/unpay`, { method: 'POST' });
    },
    onSuccess: async () => {
      setUnpaying(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível desfazer o pagamento.');
    },
  });

  const cancel = useMutation({
    mutationFn: async (bill: BillItem) => {
      const path = bill.status === 'CANCELED' ? 'reopen' : 'cancel';
      return api(`/bills/${bill.id}/${path}`, { method: 'PATCH' });
    },
    onSuccess: async () => {
      await invalidate();
    },
  });

  const remove = useMutation({
    mutationFn: async (bill: BillItem) => {
      await api(`/bills/${bill.id}`, { method: 'DELETE' });
    },
    onSuccess: async () => {
      await invalidate();
    },
  });

  return (
    <section>
      <PageHeader title="Contas a pagar" description="O que vence, o que já foi pago e o que atrasou.">
        <MonthInput value={month} onChange={setMonth} />
        <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="size-4"
            checked={showCanceled}
            onChange={(event) => {
              setShowCanceled(event.target.checked);
            }}
          />
          Mostrar canceladas
        </label>
        <Button
          offlineLock
          onClick={() => {
            setEditing(null);
            form.reset({ ...emptyForm, dueDate: todayInput() });
            setOpen(true);
          }}
        >
          Nova conta
        </Button>
      </PageHeader>

      {total > 0 ? (
        <div className="mt-6 rounded-lg bg-surface p-6">
          <p className="text-sm text-ink">
            {paidCount} de {total} pagas · {formatMoney(remaining.toFixed(2))} restantes
          </p>
          <div className="mt-3">
            <ProgressBar ratio={total === 0 ? 0 : paidCount / total} label="Contas pagas no mês" />
          </div>
        </div>
      ) : null}

      {bills.isLoading ? <p className="mt-6 text-ink-soft">Carregando contas…</p> : null}
      {bills.isError ? <p className="mt-6 text-ink">Não foi possível carregar as contas.</p> : null}
      {rows.length === 0 && !bills.isLoading ? (
        <EmptyState title="Nenhuma conta neste mês">
          <p>Cadastre um boleto ou uma fatura para acompanhar o vencimento sem lançar duas vezes.</p>
        </EmptyState>
      ) : null}

      <BillSection title="Atrasadas" rows={overdue} onPay={openPay} onUnpay={setUnpaying} onEdit={(bill) => { setEditing(bill); setOpen(true); form.reset(formFrom(bill)); }} onCancel={(bill) => { cancel.mutate(bill); }} onRemove={(bill) => { remove.mutate(bill); }} />
      <BillSection title="A pagar" rows={openRows} onPay={openPay} onUnpay={setUnpaying} onEdit={(bill) => { setEditing(bill); setOpen(true); form.reset(formFrom(bill)); }} onCancel={(bill) => { cancel.mutate(bill); }} onRemove={(bill) => { remove.mutate(bill); }} />
      <BillSection title="Pagas" rows={paid} muted onPay={openPay} onUnpay={setUnpaying} onEdit={(bill) => { setEditing(bill); setOpen(true); form.reset(formFrom(bill)); }} onCancel={(bill) => { cancel.mutate(bill); }} onRemove={(bill) => { remove.mutate(bill); }} />
      <BillSection title="Canceladas" rows={canceled} muted onPay={openPay} onUnpay={setUnpaying} onEdit={(bill) => { setEditing(bill); setOpen(true); form.reset(formFrom(bill)); }} onCancel={(bill) => { cancel.mutate(bill); }} onRemove={(bill) => { remove.mutate(bill); }} />

      <Modal open={open} title={editing ? 'Editar conta' : 'Nova conta a pagar'} onClose={closeForm}>
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
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Valor previsto">
              <input type="number" min="0.01" step="0.01" className={`${controlClass} tabular-nums`} {...form.register('amount')} />
            </Field>
            <Field label="Vencimento">
              <DateInput
                value={form.watch('dueDate')}
                onChange={(dueDate) => {
                  form.setValue('dueDate', dueDate, { shouldDirty: true });
                }}
              />
            </Field>
          </div>
          <Field label="Paga com (opcional)">
            <ChoiceSelect
              title="Conta"
              searchLabel="Buscar conta"
              options={(accounts.data ?? []).map((account) => ({ value: account.id, label: account.name }))}
              value={form.watch('accountId')}
              onChange={(accountId) => {
                form.setValue('accountId', accountId, { shouldDirty: true });
              }}
            />
          </Field>
          <label className="flex min-h-11 items-center gap-3 text-sm">
            <input type="checkbox" className="size-4" checked={card} onChange={(event) => { form.setValue('card', event.target.checked); }} />
            É fatura de cartão?
          </label>
          {card ? (
            <>
              <p className="text-sm text-ink-soft">O pagamento vira transferência, não despesa.</p>
              <Field label="Cartão">
                <ChoiceSelect
                  title="Cartão"
                  searchLabel="Buscar cartão"
                  allowEmpty={false}
                  options={cards.map((account) => ({ value: account.id, label: account.name }))}
                  value={form.watch('targetAccountId')}
                  onChange={(targetAccountId) => {
                    form.setValue('targetAccountId', targetAccountId, { shouldDirty: true });
                  }}
                />
              </Field>
            </>
          ) : (
            <Field label="Categoria">
              <CategorySelect
                categories={expenseCategories}
                value={form.watch('categoryId')}
                onChange={(categoryId) => {
                  form.setValue('categoryId', categoryId, { shouldDirty: true });
                }}
              />
            </Field>
          )}
          {editing ? null : (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" className="size-4" checked={repeats} onChange={(event) => { form.setValue('repeats', event.target.checked); }} />
              Repete todo mês?
            </label>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>Cancelar</Button>
            <Button offlineLock type="submit" disabled={save.isPending}>{save.isPending ? 'Salvando…' : 'Salvar'}</Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(paying)}
        title="Confirmar pagamento"
        onClose={() => {
          setPaying(null);
          setError(null);
        }}
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            void payForm.handleSubmit((values) => {
              pay.mutate(values);
            })(event);
          }}
        >
          {error ? <Notice>{error}</Notice> : null}
          {suggested ? (
            <div className="rounded-md bg-surface-sunken p-3 text-sm">
              <p>
                Já existe um lançamento parecido: {suggested.description} · {formatMoney(suggested.amount)} ·{' '}
                {formatDate(suggested.date)}
                {suggested.source === 'IMPORTED' ? ' (importado)' : ''}.
              </p>
              <Button
                className="mt-3 w-full"
                offlineLock
                disabled={link.isPending}
                onClick={() => {
                  link.mutate(suggested.transactionId);
                }}
              >
                Vincular a este lançamento
              </Button>
            </div>
          ) : null}
          <Field label="Valor pago">
            <input
              type="number"
              min="0.01"
              step="0.01"
              autoFocus
              className={`${controlClass} tabular-nums`}
              {...payForm.register('amount')}
            />
          </Field>
          <Field label="Data">
            <DateInput
              value={payForm.watch('date')}
              onChange={(date) => {
                payForm.setValue('date', date, { shouldDirty: true });
              }}
            />
          </Field>
          <Field label="Conta">
            <ChoiceSelect
              title="Conta"
              searchLabel="Buscar conta"
              allowEmpty={false}
              options={(accounts.data ?? []).map((account) => ({ value: account.id, label: account.name }))}
              value={payForm.watch('accountId')}
              onChange={(accountId) => {
                payForm.setValue('accountId', accountId, { shouldDirty: true });
              }}
            />
          </Field>
          {paying?.targetAccountId ? (
            <p className="text-sm text-ink-soft">O pagamento vira transferência para {paying.targetAccountName}.</p>
          ) : (
            <Field label="Categoria">
              <CategorySelect
                categories={expenseCategories}
                value={payForm.watch('categoryId')}
                onChange={(categoryId) => {
                  payForm.setValue('categoryId', categoryId, { shouldDirty: true });
                }}
              />
            </Field>
          )}
          {lowMatches.length > 0 ? (
            <p className="text-sm text-ink-soft">
              Outros lançamentos parecidos: {lowMatches.map((item) => item.description).join(', ')}.
            </p>
          ) : null}
          <Button offlineLock className="w-full" type="submit" variant={suggested ? 'secondary' : 'primary'} disabled={pay.isPending}>
            {suggested ? 'Criar um novo lançamento mesmo assim' : 'Marcar como paga'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={Boolean(unpaying)}
        title="Desfazer pagamento"
        onClose={() => {
          setUnpaying(null);
        }}
      >
        <p className="text-sm text-ink-soft">
          {unpaying?.settlement === 'LINKED'
            ? `O lançamento ${unpaying.payment?.description ?? ''} será mantido; só esta conta volta a pendente.`
            : `O lançamento ${unpaying?.payment?.description ?? unpaying?.description ?? ''} será excluído e o saldo volta ao valor anterior.`}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => { setUnpaying(null); }}>Cancelar</Button>
          <Button
            offlineLock
            disabled={unpay.isPending}
            onClick={() => {
              if (unpaying) unpay.mutate(unpaying);
            }}
          >
            Desfazer
          </Button>
        </div>
      </Modal>
    </section>
  );
}

function formFrom(bill: BillItem): BillForm {
  return {
    description: bill.description,
    amount: bill.amount,
    dueDate: bill.dueDate,
    accountId: bill.accountId ?? '',
    categoryId: bill.categoryId ?? '',
    card: Boolean(bill.targetAccountId),
    targetAccountId: bill.targetAccountId ?? '',
    repeats: false,
  };
}

function BillSection({
  title,
  rows,
  muted = false,
  onPay,
  onUnpay,
  onEdit,
  onCancel,
  onRemove,
}: {
  title: string;
  rows: BillItem[];
  muted?: boolean;
  onPay: (bill: BillItem) => void;
  onUnpay: (bill: BillItem) => void;
  onEdit: (bill: BillItem) => void;
  onCancel: (bill: BillItem) => void;
  onRemove: (bill: BillItem) => void;
}) {
  const [menu, setMenu] = useState<string | null>(null);
  if (rows.length === 0) return null;
  return (
    <section className={`mt-6 ${muted ? 'opacity-80' : ''}`}>
      <h2 className="font-display text-h2 font-medium">{title}</h2>
      <ul className="mt-3 divide-y divide-hairline rounded-lg bg-surface px-4">
        {rows.map((bill) => (
          <li key={bill.id} className="flex flex-col gap-3 py-3 md:flex-row md:items-center">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-3">
              <input
                type="checkbox"
                className="size-5"
                checked={bill.status === 'PAID'}
                aria-label={bill.status === 'PAID' ? `Desfazer ${bill.description}` : `Pagar ${bill.description}`}
                onChange={() => {
                  if (bill.status === 'PAID') onUnpay(bill);
                  else onPay(bill);
                }}
              />
              <span className="min-w-0">
                <span className="block truncate font-medium">{bill.description}</span>
                <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                  {bill.categoryName ? <CategoryChip name={bill.categoryName} color={bill.categoryColor} /> : null}
                  <span>{bill.display.daysUntilDue < 0 ? `venceu há ${String(Math.abs(bill.display.daysUntilDue))} dias` : `vence ${formatDate(`${bill.dueDate}T12:00:00.000Z`)}`}</span>
                  {bill.settlement === 'LINKED' && bill.payment?.source === 'IMPORTED' ? <span>Pago via extrato</span> : null}
                </span>
              </span>
            </label>
            <div className="flex flex-wrap items-center gap-2 md:justify-end">
              <span className="font-bold tabular-nums">{formatMoney(bill.status === 'PAID' && bill.payment ? bill.payment.amount : bill.amount)}</span>
              <StatusBadge tone={bill.display.tone}>{bill.display.label}</StatusBadge>
              <div className="relative">
                <Button
                  variant="ghost"
                  aria-label={`Ações de ${bill.description}`}
                  onClick={() => {
                    setMenu((current) => (current === bill.id ? null : bill.id));
                  }}
                >
                  ⋯
                </Button>
                {menu === bill.id ? (
                  <div className="absolute right-0 z-10 mt-1 w-40 rounded-md border border-hairline bg-surface p-1 shadow-sm">
                    <button type="button" className="block min-h-11 w-full rounded-sm px-3 text-left text-sm hover:bg-surface-sunken" onClick={() => { setMenu(null); onEdit(bill); }}>Editar</button>
                    <button type="button" className="block min-h-11 w-full rounded-sm px-3 text-left text-sm hover:bg-surface-sunken" onClick={() => { setMenu(null); onCancel(bill); }}>{bill.status === 'CANCELED' ? 'Reabrir' : 'Cancelar'}</button>
                    {bill.recurringTransactionId ? null : (
                      <button type="button" className="block min-h-11 w-full rounded-sm px-3 text-left text-sm hover:bg-surface-sunken" onClick={() => { setMenu(null); onRemove(bill); }}>Excluir</button>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

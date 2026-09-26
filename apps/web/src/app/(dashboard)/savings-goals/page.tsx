'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSavingsGoalSchema } from '@orcadom/types';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DateInput } from '@/components/date-fields';
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
  ProgressBar,
  Select,
  StatusBadge,
  controlClass,
} from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { dateToNoonIso, daysUntilLabel, formatDate, formatMoney, humanize, todayInput } from '@/lib/format';
import { savingsGoalStatusLabels } from '@/lib/labels';
import type { Account, SavingsGoal } from '@/lib/models';

interface GoalForm {
  name: string;
  targetAmount: string;
  accountId: string;
  targetDate: string;
  startDate: string;
}

const emptyForm: GoalForm = {
  name: '',
  targetAmount: '',
  accountId: '',
  targetDate: '',
  startDate: todayInput(),
};

export default function SavingsGoalsPage() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<GoalForm>({ defaultValues: emptyForm });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const goals = useQuery({
    queryKey: ['savings-goals'],
    queryFn: () => api<SavingsGoal[]>('/savings-goals'),
  });

  const active = (goals.data ?? []).filter((goal) => goal.status === 'ACTIVE');
  const completed = (goals.data ?? []).filter((goal) => goal.status === 'COMPLETED');
  const abandoned = (goals.data ?? []).filter((goal) => goal.status === 'ABANDONED');

  function closeForm() {
    setOpen(false);
    setError(null);
    form.reset({ ...emptyForm, startDate: todayInput() });
  }

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['savings-goals'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async (values: GoalForm) => {
      const parsed = createSavingsGoalSchema.safeParse({
        name: values.name,
        targetAmount: Number(values.targetAmount),
        accountId: values.accountId,
        targetDate: values.targetDate ? dateToNoonIso(values.targetDate) : undefined,
        startDate: values.startDate ? dateToNoonIso(values.startDate) : undefined,
      });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      }
      return api('/savings-goals', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      await invalidate();
      closeForm();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível criar a meta.');
    },
  });

  return (
    <section>
      <PageHeader
        title="Metas de economia"
        description="Quanto guardar, em qual conta. O progresso soma as transferências para essa conta a partir da data de início."
      >
        <Button
          onClick={() => {
            form.reset({ ...emptyForm, startDate: todayInput(), accountId: accounts.data?.[0]?.id ?? '' });
            setError(null);
            setOpen(true);
          }}
        >
          Nova meta
        </Button>
      </PageHeader>

      {error && !open ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {goals.isLoading ? <p className="mt-6 text-ink-soft">Carregando metas…</p> : null}

      {!goals.isLoading && (goals.data ?? []).length === 0 ? (
        <EmptyState title="Nenhuma meta ainda">
          <p>Defina um valor a guardar e vincule a uma conta. Transferências para essa conta passam a contar sozinhas.</p>
          <div className="mt-4">
            <Button
              onClick={() => {
                form.reset({
                  ...emptyForm,
                  startDate: todayInput(),
                  accountId: accounts.data?.[0]?.id ?? '',
                });
                setOpen(true);
              }}
            >
              Criar primeira meta
            </Button>
          </div>
        </EmptyState>
      ) : null}

      {active.length > 0 ? (
        <ul className="mt-6 space-y-4">
          {active.map((goal) => (
            <GoalCard key={goal.id} goal={goal} />
          ))}
        </ul>
      ) : null}

      {completed.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-h2 font-medium">Concluídas</h2>
          <ul className="mt-4 space-y-3">
            {completed.map((goal) => (
              <li key={goal.id} className="rounded-lg bg-surface p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <Link href={`/savings-goals/${goal.id}`} className="font-display text-h2 font-medium text-ink">
                      {goal.name}
                    </Link>
                    <p className="mt-1 text-sm text-ink-soft">
                      {formatMoney(goal.targetAmount)} guardados
                      {goal.completedAt ? ` · concluída em ${formatDate(goal.completedAt)}` : ''}
                    </p>
                  </div>
                  <StatusBadge tone="income">{savingsGoalStatusLabels.COMPLETED}</StatusBadge>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {abandoned.length > 0 ? (
        <section className="mt-10">
          <h2 className="font-display text-h2 font-medium">Abandonadas</h2>
          <ul className="mt-4 space-y-3">
            {abandoned.map((goal) => (
              <li key={goal.id} className="rounded-lg bg-surface p-6">
                <Link href={`/savings-goals/${goal.id}`} className="font-display text-h2 font-medium text-ink">
                  {goal.name}
                </Link>
                <p className="mt-1 text-sm text-ink-soft">
                  {formatMoney(goal.saved)} de {formatMoney(goal.targetAmount)} · {goal.accountName}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal open={open} title="Nova meta" onClose={closeForm}>
        {error ? (
          <div className="mb-4">
            <Notice>{error}</Notice>
          </div>
        ) : null}
        {(accounts.data ?? []).length === 0 ? (
          <div>
            <p className="text-sm text-ink-soft">Crie uma conta antes de definir uma meta.</p>
            <div className="mt-4">
              <ButtonLink href="/accounts">Ir para contas</ButtonLink>
            </div>
          </div>
        ) : (
          <form
            className="space-y-4"
            onSubmit={(event) => {
              void form.handleSubmit((values) => {
                save.mutate(values);
              })(event);
            }}
          >
            <Field label="Nome">
              <input {...form.register('name')} className={controlClass} placeholder="Viagem, reserva, reforma…" />
            </Field>
            <Field label="Valor alvo">
              <input
                type="number"
                inputMode="decimal"
                min="0.01"
                step="0.01"
                {...form.register('targetAmount')}
                className={`${controlClass} tabular-nums`}
              />
            </Field>
            <Field label="Conta vinculada">
              <Select {...form.register('accountId')}>
                <option value="">Escolha a conta</option>
                {(accounts.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name}
                  </option>
                ))}
              </Select>
            </Field>
            <p className="text-sm text-ink-soft">
              Prefira uma conta só para esta meta. Se ela também for usada no dia a dia, o progresso
              conta só as transferências — o saldo da conta pode ser diferente.
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Prazo (opcional)">
                <DateInput
                  allowEmpty
                  value={form.watch('targetDate')}
                  onChange={(targetDate) => {
                    form.setValue('targetDate', targetDate, { shouldDirty: true, shouldValidate: true });
                  }}
                />
              </Field>
              <Field label="Contar a partir de">
                <DateInput
                  value={form.watch('startDate')}
                  onChange={(startDate) => {
                    form.setValue('startDate', startDate, { shouldDirty: true, shouldValidate: true });
                  }}
                />
              </Field>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" type="button" onClick={closeForm}>
                Cancelar
              </Button>
              <Button type="submit" disabled={save.isPending}>
                Criar meta
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </section>
  );
}

function GoalCard({ goal }: { goal: SavingsGoal }) {
  return (
    <li className="rounded-lg bg-surface p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href={`/savings-goals/${goal.id}`} className="font-display text-h2 font-medium text-ink">
            {goal.name}
          </Link>
          <p className="mt-1 text-sm text-ink-soft">
            {goal.accountName}
            {goal.targetDate ? ` · ${daysUntilLabel(goal.targetDate)}` : ''}
          </p>
        </div>
        <StatusBadge tone="brand">{savingsGoalStatusLabels.ACTIVE}</StatusBadge>
      </div>
      <div className="mt-4">
        <ProgressBar
          ratio={goal.ratio}
          tone={goal.ratio >= 1 ? 'income' : 'brand'}
          label={`${formatMoney(goal.saved)} de ${formatMoney(goal.targetAmount)} guardados`}
        />
        <p className="mt-2 text-sm text-ink">
          {formatMoney(goal.saved)} de {formatMoney(goal.targetAmount)} guardados
          {goal.targetDate ? ` · ${daysUntilLabel(goal.targetDate)}` : ''}
        </p>
      </div>
    </li>
  );
}

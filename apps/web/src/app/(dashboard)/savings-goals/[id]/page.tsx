'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { updateSavingsGoalSchema } from '@orcadom/types';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { DateInput } from '@/components/date-fields';
import { EntityAudit } from '@/components/entity-audit';
import {
  Button,
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
import {
  dateToNoonIso,
  daysUntilLabel,
  formatDate,
  formatMoney,
  humanize,
} from '@/lib/format';
import { savingsGoalStatusLabels } from '@/lib/labels';
import type { SavingsGoalDetail } from '@/lib/models';

interface EditForm {
  name: string;
  targetAmount: string;
  targetDate: string;
}

export default function SavingsGoalDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [pendingAbandon, setPendingAbandon] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<EditForm>();
  const goal = useQuery({
    queryKey: ['savings-goals', params.id],
    queryFn: () => api<SavingsGoalDetail>(`/savings-goals/${params.id}`),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['savings-goals'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['audit-logs'] }),
    ]);
  }

  const save = useMutation({
    mutationFn: async (values: EditForm) => {
      const parsed = updateSavingsGoalSchema.safeParse({
        name: values.name,
        targetAmount: Number(values.targetAmount),
        targetDate: values.targetDate ? dateToNoonIso(values.targetDate) : null,
      });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      }
      return api(`/savings-goals/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
    },
    onSuccess: async () => {
      setEditing(false);
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível atualizar a meta.');
    },
  });

  const abandon = useMutation({
    mutationFn: () => api(`/savings-goals/${params.id}/abandon`, { method: 'PATCH' }),
    onSuccess: async () => {
      setPendingAbandon(false);
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setPendingAbandon(false);
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível abandonar a meta.');
    },
  });

  const remove = useMutation({
    mutationFn: () => api(`/savings-goals/${params.id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate();
      router.replace('/savings-goals');
    },
    onError: (caught: unknown) => {
      setPendingDelete(false);
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir a meta.');
    },
  });

  const data = goal.data;
  const statusTone =
    data?.status === 'COMPLETED' ? 'income' : data?.status === 'ABANDONED' ? 'neutral' : 'brand';

  return (
    <section>
      <p className="mb-4 text-sm">
        <Link href="/savings-goals" className="text-brand">
          ← Metas
        </Link>
      </p>
      {goal.isLoading ? <p className="text-ink-soft">Carregando meta…</p> : null}
      {goal.isError ? <Notice>Não foi possível carregar esta meta.</Notice> : null}

      {data ? (
        <>
          <PageHeader title={data.name} description={data.accountName}>
            {data.status === 'ACTIVE' ? (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    form.reset({
                      name: data.name,
                      targetAmount: data.targetAmount,
                      targetDate: data.targetDate ? data.targetDate.slice(0, 10) : '',
                    });
                    setError(null);
                    setEditing(true);
                  }}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setPendingAbandon(true);
                  }}
                >
                  Abandonar
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setPendingDelete(true);
              }}
            >
              Excluir
            </Button>
          </PageHeader>

          {error ? (
            <div className="mt-4">
              <Notice>{error}</Notice>
            </div>
          ) : null}

          <div className="mt-6 rounded-lg bg-surface p-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <StatusBadge tone={statusTone}>{savingsGoalStatusLabels[data.status]}</StatusBadge>
              {data.targetDate ? (
                <p className="text-sm text-ink-soft">
                  Prazo {formatDate(data.targetDate)} · {daysUntilLabel(data.targetDate)}
                </p>
              ) : (
                <p className="text-sm text-ink-soft">Sem prazo definido</p>
              )}
            </div>
            {data.status === 'ACTIVE' ? (
              <div className="mt-4">
                <ProgressBar
                  ratio={data.ratio}
                  tone={data.ratio >= 1 ? 'income' : 'brand'}
                  label={`${formatMoney(data.saved)} de ${formatMoney(data.targetAmount)} guardados`}
                />
                <p className="mt-2 text-sm text-ink">
                  {formatMoney(data.saved)} de {formatMoney(data.targetAmount)} guardados
                </p>
              </div>
            ) : data.status === 'COMPLETED' ? (
              <p className="mt-4 text-sm text-income">
                Meta de {formatMoney(data.targetAmount)} concluída
                {data.completedAt ? ` em ${formatDate(data.completedAt)}` : ''}.
              </p>
            ) : (
              <p className="mt-4 text-sm text-ink-soft">
                {formatMoney(data.saved)} de {formatMoney(data.targetAmount)} tinham sido guardados.
              </p>
            )}
            <p className="mt-2 text-sm text-ink-soft">
              Transferências a partir de {formatDate(data.startDate)}.
            </p>
          </div>

          <section className="mt-6 rounded-lg bg-surface p-6">
            <h2 className="font-display text-h2 font-medium">Transferências da meta</h2>
            {data.transfers.length === 0 ? (
              <EmptyState>
                Nenhuma transferência para esta conta desde o início da meta. Lance uma
                transferência em Lançamentos para começar a guardar.
              </EmptyState>
            ) : (
              <ol className="mt-4 divide-y divide-hairline">
                {data.transfers.map((item) => {
                  const incoming = item.direction === 'in';
                  const counterpart = incoming ? item.fromAccountName : item.toAccountName;
                  return (
                    <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <p className="text-ink">{item.description}</p>
                        <p className="text-sm text-ink-soft">
                          {formatDate(item.date)}
                          {counterpart ? ` · ${incoming ? 'de' : 'para'} ${counterpart}` : ''}
                        </p>
                      </div>
                      <p
                        className={`tabular-nums font-bold ${incoming ? 'text-income' : 'text-expense'}`}
                      >
                        {incoming ? '+' : '−'}
                        {formatMoney(item.amount)}
                      </p>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>

          <EntityAudit entityType="SavingsGoal" entityId={data.id} />
        </>
      ) : null}

      <Modal
        open={editing}
        title="Editar meta"
        onClose={() => {
          setEditing(false);
        }}
      >
        {error ? (
          <div className="mb-4">
            <Notice>{error}</Notice>
          </div>
        ) : null}
        <form
          className="space-y-4"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              save.mutate(values);
            })(event);
          }}
        >
          <Field label="Nome">
            <input {...form.register('name')} className={controlClass} />
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
          <Field label="Prazo (opcional)">
            <DateInput
              allowEmpty
              value={form.watch('targetDate')}
              onChange={(targetDate) => {
                form.setValue('targetDate', targetDate, { shouldDirty: true, shouldValidate: true });
              }}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setEditing(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              Salvar
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={pendingAbandon}
        title="Abandonar meta"
        onClose={() => {
          setPendingAbandon(false);
        }}
      >
        <p className="text-sm text-ink-soft">
          A meta deixa de ser acompanhada, mas as transferências continuam no extrato.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPendingAbandon(false);
            }}
          >
            Voltar
          </Button>
          <Button
            disabled={abandon.isPending}
            onClick={() => {
              abandon.mutate();
            }}
          >
            Abandonar
          </Button>
        </div>
      </Modal>

      <Modal
        open={pendingDelete}
        title="Excluir meta"
        onClose={() => {
          setPendingDelete(false);
        }}
      >
        <p className="text-sm text-ink-soft">
          Remove só a meta. As transferências permanecem como lançamentos normais.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPendingDelete(false);
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={remove.isPending}
            onClick={() => {
              remove.mutate();
            }}
          >
            Excluir
          </Button>
        </div>
      </Modal>
    </section>
  );
}

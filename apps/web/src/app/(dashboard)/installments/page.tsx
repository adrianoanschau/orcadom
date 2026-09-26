'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, EmptyState, Modal, Notice, PageHeader, ProgressBar } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { InstallmentPlanSummary } from '@/lib/models';

export default function InstallmentsPage() {
  const queryClient = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<InstallmentPlanSummary | null>(null);
  const plans = useQuery({
    queryKey: ['installment-plans'],
    queryFn: () => api<InstallmentPlanSummary[]>('/installment-plans'),
  });

  async function invalidate() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['installment-plans'] }),
      queryClient.invalidateQueries({ queryKey: ['transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['accounts'] }),
      queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['budgets'] }),
    ]);
  }

  const cancel = useMutation({
    mutationFn: (id: string) => api(`/installment-plans/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      setPending(null);
      setError(null);
      await invalidate();
    },
    onError: (caught: unknown) => {
      setPending(null);
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Não foi possível cancelar as parcelas futuras.',
      );
    },
  });

  return (
    <section>
      <PageHeader
        title="Parcelas"
        description="Compras parceladas. Cancelar remove só o que ainda não venceu — parcelas já debitadas ficam no extrato."
      />
      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {plans.isLoading ? <p className="mt-6 text-ink-soft">Carregando planos…</p> : null}
      {plans.data?.length === 0 ? (
        <EmptyState>
          Nenhum parcelamento ainda. No lançamento de despesa, marque “É parcelado?”.
        </EmptyState>
      ) : null}
      <ul className="mt-6 space-y-4">
        {(plans.data ?? []).map((plan) => {
          const ratio = plan.installmentsCount > 0 ? plan.postedCount / plan.installmentsCount : 0;
          return (
            <li key={plan.id} className="rounded-lg bg-surface p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-h2 font-medium">{plan.description}</h2>
                  <p className="mt-1 text-sm text-ink-soft">
                    {plan.accountName}
                    {plan.categoryName ? ` · ${plan.categoryName}` : ''} ·{' '}
                    {formatDate(plan.purchaseDate)}
                  </p>
                </div>
                {plan.scheduledCount > 0 ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setPending(plan);
                    }}
                  >
                    Cancelar futuras
                  </Button>
                ) : null}
              </div>
              <div className="mt-4">
                <ProgressBar
                  ratio={ratio}
                  tone="brand"
                  label={`${String(plan.postedCount)} de ${String(plan.installmentsCount)} parcelas pagas`}
                />
                <p className="mt-2 text-sm text-ink">
                  {String(plan.postedCount)}/{String(plan.installmentsCount)} pagas ·{' '}
                  {formatMoney(plan.remainingAmount)} restantes
                </p>
                <p className="mt-1 text-sm text-ink-soft">Total {formatMoney(plan.totalAmount)}</p>
              </div>
            </li>
          );
        })}
      </ul>

      <Modal
        open={Boolean(pending)}
        title="Cancelar parcelas futuras"
        onClose={() => {
          setPending(null);
        }}
      >
        <p className="text-sm text-ink-soft">
          Cancelar as {String(pending?.scheduledCount ?? 0)} parcelas ainda não vencidas de{' '}
          {pending?.description}? As já debitadas permanecem no extrato.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPending(null);
            }}
          >
            Voltar
          </Button>
          <Button
            disabled={cancel.isPending}
            onClick={() => {
              if (pending) cancel.mutate(pending.id);
            }}
          >
            {cancel.isPending ? 'Cancelando…' : 'Cancelar futuras'}
          </Button>
        </div>
      </Modal>
    </section>
  );
}

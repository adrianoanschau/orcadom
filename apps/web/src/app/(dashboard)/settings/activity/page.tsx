'use client';

import { useQuery } from '@tanstack/react-query';
import { AuditEntry } from '@/components/entity-audit';
import { EmptyState, PageHeader, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import type { AuditLogEntry } from '@/lib/models';

const entityLabels: Record<string, string> = {
  Transaction: 'Lançamento',
  Account: 'Conta',
  Category: 'Categoria',
  Budget: 'Orçamento',
  InstallmentPlan: 'Parcelamento',
  RecurringTransaction: 'Recorrência',
  ImportBatch: 'Importação',
  HouseholdMember: 'Membro',
  SavingsGoal: 'Meta',
};

export default function ActivityPage() {
  const logs = useQuery({
    queryKey: ['audit-logs', 'feed'],
    queryFn: () => api<AuditLogEntry[]>('/audit-logs?limit=50'),
  });

  return (
    <section className="space-y-6">
      <PageHeader
        title="Atividade"
        description="Quem criou, editou ou removeu algo neste espaço — inclusive jobs e importação por email."
      />

      {logs.isLoading ? <p className="text-sm text-ink-soft">Carregando atividade…</p> : null}
      {(logs.data ?? []).length === 0 && !logs.isLoading ? (
        <EmptyState>Nenhuma atividade registrada ainda.</EmptyState>
      ) : (
        <ol className="divide-y divide-hairline rounded-lg bg-surface px-4 sm:px-6">
          {(logs.data ?? []).map((item) => (
            <li key={item.id} className="py-4">
              <StatusBadge tone="neutral">
                {entityLabels[item.entityType] ?? item.entityType}
              </StatusBadge>
              <div className="mt-2">
                <AuditEntry item={item} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

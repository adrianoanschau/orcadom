'use client';

import { useQuery } from '@tanstack/react-query';
import { AuditEntry } from '@/components/entity-audit';
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
};

export default function ActivityPage() {
  const logs = useQuery({
    queryKey: ['audit-logs', 'feed'],
    queryFn: () => api<AuditLogEntry[]>('/audit-logs?limit=50'),
  });

  return (
    <section className="space-y-6">
      <div>
        <h1 className="font-display text-[28px] font-semibold">Atividade</h1>
        <p className="mt-2 text-sm text-ink-soft">
          Quem criou, editou ou removeu algo neste espaço — inclusive jobs e importação por email.
        </p>
      </div>

      {logs.isLoading ? <p className="text-sm text-ink-soft">Carregando atividade…</p> : null}
      {(logs.data ?? []).length === 0 && !logs.isLoading ? (
        <p className="text-sm text-ink-soft">Nenhuma atividade registrada ainda.</p>
      ) : (
        <ol className="divide-y divide-hairline rounded-lg bg-surface px-6">
          {(logs.data ?? []).map((item) => (
            <li key={item.id} className="py-4">
              <p className="text-xs uppercase tracking-wide text-ink-soft">
                {entityLabels[item.entityType] ?? item.entityType}
              </p>
              <div className="mt-1">
                <AuditEntry item={item} />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { AuditLogEntry } from '@/lib/models';

export function EntityAudit({ entityType, entityId }: { entityType: string; entityId: string }) {
  const logs = useQuery({
    queryKey: ['audit-logs', entityType, entityId],
    queryFn: () =>
      api<AuditLogEntry[]>(`/audit-logs?entityType=${entityType}&entityId=${entityId}&limit=20`),
  });

  return (
    <div className="border-t border-hairline pt-4">
      <h3 className="text-sm font-medium text-ink">Histórico</h3>
      {logs.isLoading ? <p className="mt-2 text-sm text-ink-soft">Carregando histórico…</p> : null}
      {(logs.data ?? []).length === 0 && !logs.isLoading ? (
        <p className="mt-2 text-sm text-ink-soft">Nenhuma alteração registrada ainda.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {(logs.data ?? []).map((item) => (
            <li key={item.id}>
              <AuditEntry item={item} />
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function AuditEntry({ item }: { item: AuditLogEntry }) {
  return (
    <div>
      <p className="text-sm text-ink">
        {item.headline}
        <span className="mt-1 block text-ink-soft sm:mt-0 sm:ml-2 sm:inline">
          {formatDateTime(item.createdAt)}
        </span>
      </p>
      {item.changes.length > 0 ? (
        <ul className="mt-1 space-y-0.5 text-sm text-ink-soft">
          {item.changes.map((change) => (
            <li key={change}>{change}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { REPORT_PDF_WARN_THRESHOLD, REPORT_SYNC_THRESHOLD } from '@orcadom/types';
import { useEffect, useState } from 'react';
import { ApiError, api, apiBlob } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { ReportFormat, ReportRequest, ReportStatus } from '@/lib/models';
import { Button, Modal, Notice, StatusBadge } from './ui';

export interface ExportFilters {
  accountId: string;
  categoryId: string;
  from: string;
  to: string;
}

const statusTone: Record<ReportStatus, 'pending' | 'brand'> = {
  PENDING: 'pending',
  PROCESSING: 'pending',
  READY: 'brand',
  FAILED: 'pending',
};

const statusLabel: Record<ReportStatus, string> = {
  PENDING: 'Na fila',
  PROCESSING: 'Gerando…',
  READY: 'Pronto',
  FAILED: 'Falhou',
};

export function ExportReportPanel({
  filters,
  total,
  accountName,
  categoryName,
  highlightId,
  open,
  onClose,
}: {
  filters: ExportFilters;
  total: number;
  accountName?: string;
  categoryName?: string;
  highlightId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [format, setFormat] = useState<ReportFormat>('PDF');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const reports = useQuery({
    queryKey: ['reports'],
    queryFn: () => api<ReportRequest[]>('/reports'),
    refetchInterval: (query) => {
      const items = query.state.data ?? [];
      return items.some((item) => item.status === 'PENDING' || item.status === 'PROCESSING')
        ? 3_000
        : false;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const created = await api<ReportRequest>('/reports', {
        method: 'POST',
        body: JSON.stringify(toReportBody(filters, format)),
      });
      if (created.status === 'READY') {
        await downloadReport(created.id);
      }
      if (created.status === 'FAILED') {
        throw new ApiError('Não foi possível gerar o relatório.', 500);
      }
      return created;
    },
    onSuccess: async (created) => {
      await queryClient.invalidateQueries({ queryKey: ['reports'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      setError(null);
      if (created.status === 'READY') {
        setInfo(null);
        onClose();
        return;
      }
      setInfo('Relatório grande: vamos avisar quando estiver pronto.');
      onClose();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível exportar o relatório.');
    },
  });

  const download = useMutation({
    mutationFn: downloadReport,
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível baixar o relatório.');
    },
  });

  const items = reports.data ?? [];

  useEffect(() => {
    if (!highlightId) return;
    document.getElementById(`report-${highlightId}`)?.scrollIntoView({ block: 'nearest' });
  }, [highlightId, items.length]);

  return (
    <>
      {info ? (
        <div className="mt-4">
          <Notice>{info}</Notice>
        </div>
      ) : null}

      {items.length > 0 ? (
        <div className="mt-6 rounded-lg bg-surface p-6">
          <h2 className="font-display text-h2 font-medium">Seus relatórios</h2>
          <ul className="mt-3 divide-y divide-hairline">
            {items.map((item) => (
              <li
                key={item.id}
                id={`report-${item.id}`}
                className={`flex flex-wrap items-center justify-between gap-3 py-3 ${
                  highlightId === item.id ? 'rounded-sm bg-surface-sunken px-2' : ''
                }`}
              >
                <div>
                  <p className="font-medium text-ink">{item.format === 'PDF' ? 'PDF' : 'Excel'}</p>
                  <p className="text-sm text-ink-soft">{formatDate(item.createdAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge tone={statusTone[item.status]}>{statusLabel[item.status]}</StatusBadge>
                  {item.status === 'READY' && item.downloadUrl ? (
                    <Button
                      variant="secondary"
                      disabled={download.isPending}
                      onClick={() => {
                        download.mutate(item.id);
                      }}
                    >
                      Baixar
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <Modal open={open} title="Exportar relatório" onClose={onClose}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            create.mutate();
          }}
        >
          {error ? <Notice>{error}</Notice> : null}
          <p className="text-sm text-ink-soft">{filterSummary(filters, accountName, categoryName, total)}</p>
          <fieldset className="space-y-2">
            <legend className="text-sm text-ink-soft">Formato</legend>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="format"
                checked={format === 'PDF'}
                onChange={() => {
                  setFormat('PDF');
                }}
              />
              PDF
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name="format"
                checked={format === 'XLSX'}
                onChange={() => {
                  setFormat('XLSX');
                }}
              />
              Excel
            </label>
          </fieldset>
          {format === 'PDF' && total > REPORT_PDF_WARN_THRESHOLD ? (
            <Notice>Muitos lançamentos para um PDF legível. Prefira Excel nesta exportação.</Notice>
          ) : null}
          {total > REPORT_SYNC_THRESHOLD ? (
            <p className="text-sm text-ink-soft">
              Este filtro tem mais de {REPORT_SYNC_THRESHOLD.toLocaleString('pt-BR')} lançamentos. O
              arquivo será gerado em segundo plano.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? 'Gerando…' : 'Exportar'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}

async function downloadReport(id: string): Promise<void> {
  const { blob, fileName } = await apiBlob(`/reports/${id}/download`);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName ?? `orcadom-extrato-${id}`;
  link.click();
  URL.revokeObjectURL(url);
}

function toReportBody(filters: ExportFilters, format: ReportFormat) {
  return {
    format,
    ...(filters.accountId ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.from ? { from: `${filters.from}T00:00:00.000Z` } : {}),
    ...(filters.to ? { to: `${filters.to}T23:59:59.999Z` } : {}),
  };
}

function filterSummary(
  filters: ExportFilters,
  accountName: string | undefined,
  categoryName: string | undefined,
  total: number,
): string {
  const parts = [`${String(total)} lançamento${total === 1 ? '' : 's'}`];
  parts.push(accountName ? `conta ${accountName}` : 'todas as contas');
  parts.push(categoryName ? `categoria ${categoryName}` : 'todas as categorias');
  if (filters.from && filters.to) {
    parts.push(`${formatDate(`${filters.from}T00:00:00.000Z`)} a ${formatDate(`${filters.to}T23:59:59.999Z`)}`);
  } else if (filters.from) {
    parts.push(`a partir de ${formatDate(`${filters.from}T00:00:00.000Z`)}`);
  } else if (filters.to) {
    parts.push(`até ${formatDate(`${filters.to}T23:59:59.999Z`)}`);
  } else {
    parts.push('todo o período');
  }
  return `Filtros aplicados: ${parts.join(' · ')}.`;
}

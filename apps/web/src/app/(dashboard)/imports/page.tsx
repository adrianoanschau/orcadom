'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type { Account, Category, ImportConfirmResult, ImportPreview } from '@/lib/models';
import { Button, Field, Notice, Select, controlClass } from '@/components/ui';

interface DraftRow {
  lineId: string;
  categoryId: string;
  include: boolean;
}

export default function ImportsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  );

  const selected = drafts.filter((draft) => draft.include);
  const missingCategory = selected.some((draft) => !draft.categoryId);

  const upload = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new ApiError('Selecione a conta do extrato.', 400);
      if (!file) throw new ApiError('Selecione um arquivo OFX ou CSV.', 400);
      const body = new FormData();
      body.append('accountId', accountId);
      body.append('file', file);
      return api<ImportPreview>('/imports', { method: 'POST', body });
    },
    onSuccess: (data) => {
      setPreview(data);
      setDrafts(
        data.rows.map((row) => ({
          lineId: row.lineId,
          categoryId: row.confidence === 'high' ? (row.suggestedCategoryId ?? '') : '',
          include: !row.isDuplicate,
        })),
      );
      setError(null);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível ler o arquivo.');
    },
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!preview) throw new ApiError('Envie um arquivo para confirmar.', 400);
      if (selected.length === 0) throw new ApiError('Selecione ao menos um lançamento.', 400);
      if (missingCategory) throw new ApiError('Informe a categoria de cada lançamento incluído.', 400);
      return api<ImportConfirmResult>(`/imports/${preview.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          rows: selected.map((draft) => ({ lineId: draft.lineId, categoryId: draft.categoryId })),
        }),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      router.push(`/transactions?accountId=${result.accountId}`);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível confirmar a importação.');
    },
  });

  const discard = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      await api(`/imports/${preview.id}`, { method: 'DELETE' });
    },
    onSuccess: () => {
      setPreview(null);
      setDrafts([]);
      setFile(null);
      setError(null);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível descartar a prévia.');
    },
  });

  function updateDraft(lineId: string, patch: Partial<DraftRow>) {
    setDrafts((current) =>
      current.map((draft) => (draft.lineId === lineId ? { ...draft, ...patch } : draft)),
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[28px] font-semibold">Importar extrato</h1>
          <p className="mt-2 text-sm text-ink-soft">
            Envie um OFX ou CSV, revise as categorias e confirme o que entra na conta.
          </p>
        </div>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}

      {!preview ? (
        <form
          className="mt-6 grid gap-4 rounded-lg bg-surface p-6 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate();
          }}
        >
          <Field label="Conta">
            <Select
              value={accountId}
              onChange={(event) => {
                setAccountId(event.target.value);
              }}
            >
              <option value="">Selecione</option>
              {accounts.data?.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Arquivo">
            <input
              type="file"
              accept=".ofx,.ofc,.csv,text/csv,application/x-ofx"
              className={controlClass}
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
              }}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" className="w-full" disabled={upload.isPending}>
              {upload.isPending ? 'Lendo arquivo…' : 'Gerar prévia'}
            </Button>
          </div>
        </form>
      ) : (
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4">
            <div>
              <p className="font-medium text-ink">{preview.fileName}</p>
              <p className="text-sm text-ink-soft">
                {preview.format} · {preview.totalRows} linhas · {preview.duplicateRows} possíveis
                duplicatas
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                onClick={() => {
                  discard.mutate();
                }}
                disabled={discard.isPending}
              >
                {discard.isPending ? 'Descartando…' : 'Descartar'}
              </Button>
              <Button
                onClick={() => {
                  confirm.mutate();
                }}
                disabled={confirm.isPending || selected.length === 0 || missingCategory}
              >
                {confirm.isPending
                  ? 'Confirmando…'
                  : `Confirmar ${String(selected.length)} lançamento${selected.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg bg-surface">
            <table className="min-w-full text-left text-sm">
              <thead className="text-ink-soft">
                <tr className="border-b border-hairline">
                  <th className="px-4 py-3 font-medium">Incluir</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">Valor</th>
                  <th className="px-4 py-3 font-medium">Categoria</th>
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row) => {
                  const draft = drafts.find((item) => item.lineId === row.lineId);
                  const suggested = row.suggestedCategoryId
                    ? categoryById.get(row.suggestedCategoryId)
                    : undefined;
                  const options = (categories.data ?? []).filter((category) => category.type === row.type);
                  return (
                    <tr key={row.lineId} className="border-b border-hairline last:border-b-0">
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          checked={draft?.include ?? false}
                          onChange={(event) => {
                            updateDraft(row.lineId, { include: event.target.checked });
                          }}
                          aria-label={`Incluir ${row.description}`}
                        />
                        {row.isDuplicate ? (
                          <p className="mt-2 text-xs text-pending">possível duplicata</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-ink-soft">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-ink">{row.description}</p>
                      </td>
                      <td
                        className={`px-4 py-3 align-top text-right font-bold tabular-nums ${
                          row.type === 'INCOME' ? 'text-income' : 'text-expense'
                        }`}
                      >
                        {row.type === 'INCOME' ? '+' : '−'}
                        {formatMoney(row.amount)}
                      </td>
                      <td className="min-w-56 px-4 py-3 align-top">
                        <Select
                          value={draft?.categoryId ?? ''}
                          onChange={(event) => {
                            updateDraft(row.lineId, { categoryId: event.target.value });
                          }}
                        >
                          <option value="">Selecione</option>
                          {options.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </Select>
                        {row.confidence === 'high' && suggested ? (
                          <p className="mt-1 text-xs text-brand">conhecida</p>
                        ) : null}
                        {row.confidence === 'low' && suggested && draft?.categoryId !== suggested.id ? (
                          <button
                            type="button"
                            className="mt-1 text-xs text-pending hover:underline"
                            onClick={() => {
                              updateDraft(row.lineId, { categoryId: suggested.id });
                            }}
                          >
                            Aplicar sugestão: {suggested.name}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { invalidateOnboarding } from '@/hooks/useOnboardingStatus';
import { ApiError, api } from '@/lib/api';
import { formatDate, formatMoney } from '@/lib/format';
import type {
  Account,
  Category,
  ImportBatchSummary,
  ImportConfirmResult,
  ImportPreview,
  ImportPreviewRow,
} from '@/lib/models';
import { CategorySelect, categoryPath } from '@/components/category-select';
import { ChoiceSelect } from '@/components/choice-select';
import {
  Button,
  ButtonLink,
  EmptyState,
  Field,
  Notice,
  PageHeader,
  StatusBadge,
  controlClass,
} from '@/components/ui';

interface DraftRow {
  lineId: string;
  categoryId: string;
  include: boolean;
  action: 'IMPORT' | 'SKIP' | 'LINK_TRANSACTION' | 'PAY_BILL' | 'RECORD_TRANSFER';
  transactionId?: string;
  billId?: string;
  counterAccountId?: string;
}

export default function ImportsPage() {
  return (
    <Suspense fallback={<p className="text-ink-soft">Carregando importação…</p>}>
      <ImportsPageInner />
    </Suspense>
  );
}

function ImportsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const categories = useQuery({
    queryKey: ['categories'],
    queryFn: () => api<Category[]>('/categories'),
  });
  const openBatches = useQuery({
    queryKey: ['imports', 'open'],
    queryFn: () => api<ImportBatchSummary[]>('/imports'),
  });

  const categoryById = useMemo(
    () => new Map((categories.data ?? []).map((category) => [category.id, category])),
    [categories.data],
  );

  const selected = drafts.filter((draft) => draft.include);
  const missingCategory = selected.some((draft) => {
    if (draft.action === 'RECORD_TRANSFER') return !draft.counterAccountId;
    if (draft.action === 'IMPORT') return !draft.categoryId;
    return false;
  });
  const needsAccount = Boolean(preview && !preview.accountId && !accountId);
  const statementAccountId = preview?.accountId ?? accountId;
  const otherAccounts = (accounts.data ?? []).filter((account) => account.id !== statementAccountId);

  function applyPreview(data: ImportPreview) {
    setPreview(data);
    setAccountId(data.accountId ?? '');
    setDrafts(
      data.rows.map((row) => {
        const suggested = row.reconciliation?.suggestedAction ?? 'IMPORT';
        const match =
          row.reconciliation?.matches.find(
            (item) => item.kind === 'OWN_TRANSFER' && item.matchConfidence === 'high',
          ) ?? row.reconciliation?.matches[0];
        return {
          lineId: row.lineId,
          categoryId: row.confidence === 'high' ? (row.suggestedCategoryId ?? '') : '',
          include: !row.isDuplicate && suggested !== 'SKIP',
          action: row.isDuplicate ? 'SKIP' : suggested,
          transactionId: match?.transactionId,
          billId: match?.billId,
          counterAccountId: match?.accountId,
        };
      }),
    );
    setConflicts([]);
    setError(null);
  }

  useEffect(() => {
    const batchId = searchParams.get('batchId');
    if (!batchId || preview?.id === batchId) return;
    void api<ImportPreview>(`/imports/${batchId}`)
      .then(applyPreview)
      .catch((caught: unknown) => {
        setError(caught instanceof ApiError ? caught.message : 'Não foi possível abrir a prévia.');
      });
  }, [preview?.id, searchParams]);

  const upload = useMutation({
    mutationFn: async () => {
      if (!accountId) throw new ApiError('Selecione a conta do extrato.', 400);
      if (!file) throw new ApiError('Selecione um arquivo OFX ou CSV.', 400);
      const body = new FormData();
      body.append('accountId', accountId);
      body.append('file', file);
      return api<ImportPreview>('/imports', { method: 'POST', body });
    },
    onSuccess: applyPreview,
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível ler o arquivo.');
    },
  });

  const confirm = useMutation({
    mutationFn: async () => {
      if (!preview) throw new ApiError('Envie um arquivo para confirmar.', 400);
      if (selected.length === 0) throw new ApiError('Selecione ao menos um lançamento.', 400);
      if (missingCategory)
        throw new ApiError('Informe a categoria, ou a outra conta da transferência, de cada lançamento incluído.', 400);
      if (!preview.accountId && !accountId)
        throw new ApiError('Selecione a conta deste extrato.', 400);
      return api<ImportConfirmResult>(`/imports/${preview.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          accountId: preview.accountId ?? accountId,
          rows: selected.map((draft) => ({
            lineId: draft.lineId,
            action: draft.action,
            categoryId: draft.categoryId || undefined,
            transactionId: draft.transactionId,
            billId: draft.billId,
            counterAccountId: draft.counterAccountId,
          })),
        }),
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['transactions'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['imports'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
      await invalidateOnboarding(queryClient);
      router.push(`/transactions?accountId=${result.accountId}`);
    },
    onError: (caught: unknown) => {
      setConflicts(conflictIdsFrom(caught));
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível confirmar a importação.',
      );
    },
  });

  const discard = useMutation({
    mutationFn: async () => {
      if (!preview) return;
      await api(`/imports/${preview.id}`, { method: 'DELETE' });
    },
    onSuccess: async () => {
      setPreview(null);
      setDrafts([]);
      setFile(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['imports'] });
      await queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível descartar a prévia.',
      );
    },
  });

  function updateDraft(lineId: string, patch: Partial<DraftRow>) {
    setConflicts((current) => current.filter((id) => id !== lineId));
    setDrafts((current) =>
      current.map((draft) => (draft.lineId === lineId ? { ...draft, ...patch } : draft)),
    );
  }

  return (
    <section>
      <PageHeader
        title="Importar extrato"
        description="Envie um OFX ou CSV, revise as categorias e confirme o que entra na conta."
      >
        <ButtonLink href="/settings/import-alias" variant="ghost">
          Importar por email
        </ButtonLink>
      </PageHeader>

      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}

      {!preview && (openBatches.data ?? []).length > 0 ? (
        <div className="mt-6 rounded-lg bg-surface p-6">
          <h2 className="font-display text-h2 font-medium">Aguardando revisão</h2>
          <ul className="mt-3 divide-y divide-hairline">
            {openBatches.data?.map((batch) => (
              <li key={batch.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-ink">{batch.fileName}</p>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
                    <StatusBadge tone="neutral">
                      {batch.source === 'EMAIL' ? 'Email' : 'Upload'}
                    </StatusBadge>
                    {batch.totalRows} linhas
                    {batch.status === 'UNMAPPED_ACCOUNT' ? (
                      <StatusBadge tone="pending">conta ainda não mapeada</StatusBadge>
                    ) : null}
                    {batch.bankId ? ` · ${batch.bankId}/${batch.acctId ?? '—'}` : ''}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void api<ImportPreview>(`/imports/${batch.id}`)
                      .then(applyPreview)
                      .catch((caught: unknown) => {
                        setError(
                          caught instanceof ApiError
                            ? caught.message
                            : 'Não foi possível abrir a prévia.',
                        );
                      });
                  }}
                >
                  Revisar
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {!preview && accounts.data?.length === 0 ? (
        <EmptyState title="Crie uma conta para importar">
          <p>O extrato precisa cair em uma conta. Crie a primeira e volte aqui.</p>
          <div className="mt-4">
            <ButtonLink href="/accounts">Ir para contas</ButtonLink>
          </div>
        </EmptyState>
      ) : null}

      {!preview && (accounts.data?.length ?? 0) > 0 ? (
        <form
          className="mt-6 grid gap-4 rounded-lg bg-surface p-6 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            upload.mutate();
          }}
        >
          <Field label="Conta">
            <ChoiceSelect
              title="Conta"
              searchLabel="Buscar conta"
              options={(accounts.data ?? []).map((account) => ({
                value: account.id,
                label: account.name,
              }))}
              value={accountId}
              onChange={setAccountId}
            />
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
      ) : null}

      {preview ? (
        <div className="mt-6 space-y-4">
          <div className="sticky bottom-20 z-10 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface p-4 lg:static lg:bottom-auto">
            <div>
              <p className="font-medium text-ink">{preview.fileName}</p>
              <p className="text-sm text-ink-soft">
                {preview.format} · {preview.totalRows} linhas · {preview.duplicateRows} possíveis
                duplicatas
                {preview.bankId ? ` · ${preview.bankId}/${preview.acctId ?? '—'}` : ''}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                {String(drafts.filter((draft) => draft.include && draft.action === 'IMPORT').length)}{' '}
                novas ·{' '}
                {String(drafts.filter((draft) => draft.include && draft.action === 'PAY_BILL').length)}{' '}
                contas ·{' '}
                {String(
                  drafts.filter((draft) => draft.include && draft.action === 'LINK_TRANSACTION').length,
                )}{' '}
                vinculadas ·{' '}
                {String(drafts.filter((draft) => !draft.include || draft.action === 'SKIP').length)}{' '}
                ignoradas
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
                disabled={
                  confirm.isPending || selected.length === 0 || missingCategory || needsAccount
                }
              >
                {confirm.isPending
                  ? 'Confirmando…'
                  : `Confirmar ${String(selected.length)} lançamento${selected.length === 1 ? '' : 's'}`}
              </Button>
            </div>
          </div>

          {!preview.accountId ? (
            <div className="rounded-lg bg-surface p-4">
              <Field label="Conta deste extrato">
                <ChoiceSelect
                  title="Conta deste extrato"
                  searchLabel="Buscar conta"
                  emptyLabel="Selecione para mapear este banco"
                  options={(accounts.data ?? []).map((account) => ({
                    value: account.id,
                    label: account.name,
                  }))}
                  value={accountId}
                  onChange={setAccountId}
                />
              </Field>
              <p className="mt-2 text-sm text-pending">
                Este OFX ainda não tem conta mapeada. Ao confirmar, o Orcadom lembra o BANKID/ACCTID
                para as próximas importações.
              </p>
            </div>
          ) : null}

          <ul className="space-y-3 md:hidden">
            {preview.rows.map((row) => {
              const draft = drafts.find((item) => item.lineId === row.lineId);
              const suggested = row.suggestedCategoryId
                ? categoryById.get(row.suggestedCategoryId)
                : undefined;
              const options = (categories.data ?? []).filter(
                (category) => category.type === row.type,
              );
              return (
                <li
                  key={row.lineId}
                  className={`rounded-lg bg-surface p-4 ${conflicts.includes(row.lineId) ? 'ring-1 ring-expense' : ''}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <label className="flex min-h-11 min-w-0 items-start gap-3 text-ink">
                      <input
                        type="checkbox"
                        className="mt-1 size-4"
                        checked={draft?.include ?? false}
                        onChange={(event) => {
                          updateDraft(row.lineId, { include: event.target.checked });
                        }}
                      />
                      <span>
                        <span className="block font-medium">{row.description}</span>
                        <span className="mt-1 block text-sm text-ink-soft">
                          {formatDate(row.date)}
                        </span>
                      </span>
                    </label>
                    <p
                      className={`shrink-0 text-right font-bold tabular-nums ${
                        row.type === 'INCOME' ? 'text-income' : 'text-expense'
                      }`}
                    >
                      {row.type === 'INCOME' ? '+' : '−'}
                      {formatMoney(row.amount)}
                    </p>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {conflicts.includes(row.lineId) ? (
                      <StatusBadge tone="expense">revisar</StatusBadge>
                    ) : null}
                    {row.isDuplicate ? (
                      <StatusBadge tone="pending">possível duplicata</StatusBadge>
                    ) : (
                      <ReconciliationBadge row={row} />
                    )}
                    {row.confidence === 'high' && suggested ? (
                      <StatusBadge tone="brand">conhecida</StatusBadge>
                    ) : null}
                    {draft?.action === 'RECORD_TRANSFER' ? null : (
                      <ReconciliationSelect
                        row={row}
                        value={resolutionValue(draft)}
                        onChange={(value) => {
                          updateDraft(row.lineId, resolutionPatch(row, value));
                        }}
                      />
                    )}
                  </div>
                  <div className="mt-3">
                    <ImportCategoryField
                      row={row}
                      draft={draft}
                      options={options}
                      accounts={otherAccounts}
                      suggested={suggested}
                      onCategory={(categoryId) => {
                        updateDraft(row.lineId, categoryDraft(draft, categoryId));
                      }}
                      onTransfer={(counterAccountId) => {
                        updateDraft(row.lineId, transferDraft(row, counterAccountId));
                      }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="hidden overflow-x-auto rounded-lg bg-surface md:block">
            <table className="min-w-full text-left text-sm">
              <thead className="text-ink-soft">
                <tr className="border-b border-hairline">
                  <th className="px-4 py-3 font-medium">Incluir</th>
                  <th className="px-4 py-3 font-medium">Data</th>
                  <th className="px-4 py-3 font-medium">Descrição</th>
                  <th className="px-4 py-3 font-medium">O que fazer</th>
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
                  const options = (categories.data ?? []).filter(
                    (category) => category.type === row.type,
                  );
                  return (
                    <tr
                      key={row.lineId}
                      className={`border-b border-hairline last:border-b-0 ${conflicts.includes(row.lineId) ? 'bg-expense/10' : ''}`}
                    >
                      <td className="px-4 py-3 align-top">
                        <input
                          type="checkbox"
                          className="size-4"
                          checked={draft?.include ?? false}
                          onChange={(event) => {
                            updateDraft(row.lineId, { include: event.target.checked });
                          }}
                          aria-label={`Incluir ${row.description}`}
                        />
                        {row.isDuplicate ? (
                          <div className="mt-2">
                            <StatusBadge tone="pending">possível duplicata</StatusBadge>
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 align-top whitespace-nowrap text-ink-soft">
                        {formatDate(row.date)}
                      </td>
                      <td className="px-4 py-3 align-top">
                        <p className="text-ink">{row.description}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {conflicts.includes(row.lineId) ? (
                            <StatusBadge tone="expense">revisar</StatusBadge>
                          ) : null}
                          {row.isDuplicate ? (
                            <StatusBadge tone="pending">possível duplicata</StatusBadge>
                          ) : (
                            <ReconciliationBadge row={row} />
                          )}
                        </div>
                      </td>
                      <td className="min-w-44 px-4 py-3 align-top">
                        {draft?.action === 'RECORD_TRANSFER' ? null : (
                          <ReconciliationSelect
                            row={row}
                            value={resolutionValue(draft)}
                            onChange={(value) => {
                              updateDraft(row.lineId, resolutionPatch(row, value));
                            }}
                          />
                        )}
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
                        <ImportCategoryField
                          row={row}
                          draft={draft}
                          options={options}
                          accounts={otherAccounts}
                          suggested={suggested}
                          onCategory={(categoryId) => {
                            updateDraft(row.lineId, categoryDraft(draft, categoryId));
                          }}
                          onTransfer={(counterAccountId) => {
                            updateDraft(row.lineId, transferDraft(row, counterAccountId));
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function conflictIdsFrom(error: unknown): string[] {
  if (!(error instanceof ApiError) || !error.body || typeof error.body !== 'object') return [];
  if (!('rowIds' in error.body)) return [];
  const rowIds = error.body.rowIds;
  return Array.isArray(rowIds) ? rowIds.filter((id): id is string => typeof id === 'string') : [];
}

function ReconciliationBadge({ row }: { row: ImportPreviewRow }) {
  const match = row.reconciliation?.matches[0];
  if (!match) return null;
  if (match.kind === 'BILL') return <StatusBadge tone="brand">Conta a pagar</StatusBadge>;
  if (match.kind === 'TRANSFER_MIRROR' || match.kind === 'OWN_TRANSFER') {
    return <StatusBadge tone="transfer">Transferência entre contas</StatusBadge>;
  }
  return <StatusBadge tone="pending">Já lançado</StatusBadge>;
}

function resolutionValue(draft: DraftRow | undefined): string {
  if (!draft) return 'IMPORT';
  if (draft.action === 'RECORD_TRANSFER' && draft.transactionId) {
    return `RECORD_TRANSFER:${draft.transactionId}`;
  }
  if (draft.action === 'LINK_TRANSACTION' && draft.transactionId) {
    return `LINK_TRANSACTION:${draft.transactionId}`;
  }
  return draft.action;
}

function resolutionPatch(row: ImportPreviewRow, value: string): Partial<DraftRow> {
  if (value.startsWith('LINK_TRANSACTION:')) {
    return {
      action: 'LINK_TRANSACTION',
      include: true,
      transactionId: value.slice('LINK_TRANSACTION:'.length),
      billId: undefined,
      counterAccountId: undefined,
    };
  }
  if (value.startsWith('RECORD_TRANSFER:')) {
    const transactionId = value.slice('RECORD_TRANSFER:'.length);
    const match = row.reconciliation?.matches.find(
      (item) => item.kind === 'OWN_TRANSFER' && item.transactionId === transactionId,
    );
    return {
      action: 'RECORD_TRANSFER',
      include: true,
      transactionId,
      counterAccountId: match?.accountId,
      billId: undefined,
    };
  }
  const action = value as DraftRow['action'];
  const match = row.reconciliation?.matches.find((item) =>
    action === 'PAY_BILL' ? item.kind === 'BILL' : item.kind !== 'BILL' && item.kind !== 'OWN_TRANSFER',
  );
  return {
    action,
    include: action !== 'SKIP',
    billId: match?.billId,
    transactionId: match?.transactionId,
    counterAccountId: undefined,
  };
}

function ReconciliationSelect({
  row,
  value,
  onChange,
}: {
  row: ImportPreviewRow;
  value: string;
  onChange: (value: string) => void;
}) {
  const matches = row.reconciliation?.matches ?? [];
  if (row.isDuplicate || matches.length === 0) return null;
  const options = [
    { value: 'IMPORT', label: 'Importar como nova' },
    ...matches.map((match) => ({
      value:
        match.kind === 'OWN_TRANSFER'
          ? `RECORD_TRANSFER:${match.transactionId ?? ''}`
          : match.kind === 'BILL'
            ? 'PAY_BILL'
            : match.kind === 'TRANSFER_MIRROR'
              ? 'SKIP'
              : `LINK_TRANSACTION:${match.transactionId ?? ''}`,
      label:
        match.kind === 'OWN_TRANSFER'
          ? `Transferência com "${match.accountName ?? match.description}"`
          : match.kind === 'BILL'
            ? `Pagar "${match.description}"`
            : match.kind === 'TRANSFER_MIRROR'
              ? 'Ignorar espelho'
              : `Vincular a "${match.description}"`,
    })),
  ];
  for (const match of matches) {
    if (match.kind !== 'TRANSFER_MIRROR' || match.linked) continue;
    options.splice(1, 0, {
      value: `LINK_TRANSACTION:${match.transactionId ?? ''}`,
      label: `Vincular a "${match.description}"`,
    });
  }
  const unique = options.filter((option, index) => options.findIndex((item) => item.value === option.value) === index);
  return (
    <label className="mt-2 block min-w-52 text-sm">
      <span className="sr-only">Resolução de {row.description}</span>
      <select
        className={controlClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        {unique.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {row.reconciliation?.suggestedAction === 'IMPORT' && matches.some((item) => item.kind === 'OWN_TRANSFER') ? (
        <span className="mt-1 block text-ink-soft">
          Parece uma transferência com {matches.find((item) => item.kind === 'OWN_TRANSFER')?.accountName}. Escolha essa opção para não lançar de novo.
        </span>
      ) : row.reconciliation?.suggestedAction === 'IMPORT' &&
        matches.some((item) => item.kind === 'TRANSFER_MIRROR' && !item.linked) ? (
        <span className="mt-1 block text-ink-soft">
          Este valor já entrou como transferência. Escolha vincular para conciliar, ou ignorar para não lançar de novo.
        </span>
      ) : row.reconciliation?.suggestedAction === 'IMPORT' && matches.some((item) => item.kind === 'TRANSFER_MIRROR') ? (
        <span className="mt-1 block text-ink-soft">
          Este valor já entrou como transferência. Escolha ignorar para não lançar de novo.
        </span>
      ) : row.reconciliation?.suggestedAction === 'IMPORT' && matches.length > 0 ? (
        <span className="mt-1 block text-ink-soft">Parece o pagamento de {matches[0]?.description}. Escolha vincular para conciliar.</span>
      ) : null}
    </label>
  );
}

function categoryDraft(draft: DraftRow | undefined, categoryId: string): Partial<DraftRow> {
  if (draft?.action !== 'RECORD_TRANSFER') return { categoryId };
  return {
    action: 'IMPORT',
    categoryId,
    counterAccountId: undefined,
    transactionId: undefined,
    billId: undefined,
  };
}

function transferDraft(row: ImportPreviewRow, counterAccountId: string): Partial<DraftRow> {
  const match = row.reconciliation?.matches.find(
    (item) => item.kind === 'OWN_TRANSFER' && item.accountId === counterAccountId,
  );
  return {
    action: 'RECORD_TRANSFER',
    include: true,
    counterAccountId,
    transactionId: match?.transactionId,
    billId: undefined,
  };
}

function ImportCategoryField({
  row,
  draft,
  options,
  accounts,
  suggested,
  onCategory,
  onTransfer,
}: {
  row: ImportPreviewRow;
  draft: DraftRow | undefined;
  options: Category[];
  accounts: Account[];
  suggested: Category | undefined;
  onCategory: (categoryId: string) => void;
  onTransfer: (accountId: string) => void;
}) {
  const transfer = draft?.action === 'RECORD_TRANSFER';
  const kindLabel = row.type === 'INCOME' ? 'Receita' : 'Despesa';
  return (
    <div className="space-y-2">
      <select
        className={controlClass}
        aria-label={`Classificação de ${row.description}`}
        value={transfer ? 'TRANSFER' : 'CATEGORY'}
        onChange={(event) => {
          if (event.target.value === 'TRANSFER') {
            const suggestedAccount = row.reconciliation?.matches.find(
              (item) => item.kind === 'OWN_TRANSFER' && item.matchConfidence === 'high',
            );
            const knownAccount =
              [draft?.counterAccountId, suggestedAccount?.accountId].find((id) => Boolean(id)) ?? '';
            onTransfer(knownAccount);
            return;
          }
          onCategory(draft?.categoryId ?? '');
        }}
      >
        <option value="CATEGORY">{kindLabel}</option>
        <option value="TRANSFER">Transferência</option>
      </select>
      {transfer ? (
        <ChoiceSelect
          title={row.type === 'INCOME' ? 'Veio da conta' : 'Foi para a conta'}
          searchLabel="Buscar conta"
          emptyLabel={row.type === 'INCOME' ? 'Selecione a conta de origem' : 'Selecione a conta de destino'}
          options={accounts.map((account) => ({ value: account.id, label: account.name }))}
          value={draft.counterAccountId ?? ''}
          onChange={onTransfer}
        />
      ) : (
        <>
          <CategorySelect categories={options} value={draft?.categoryId ?? ''} onChange={onCategory} />
          {row.confidence === 'high' && suggested ? (
            <p className="mt-1 text-sm text-brand">conhecida</p>
          ) : null}
          {row.confidence === 'low' && suggested && draft?.categoryId !== suggested.id ? (
            <button
              type="button"
              className="mt-1 text-sm text-pending hover:underline"
              onClick={() => {
                onCategory(suggested.id);
              }}
            >
              Aplicar sugestão: {categoryPath(options, suggested.id)}
            </button>
          ) : null}
        </>
      )}
    </div>
  );
}

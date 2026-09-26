'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { Account, BankAccountMapping, EmailImportLog, ImportAlias } from '@/lib/models';
import {
  Button,
  Field,
  Notice,
  PageHeader,
  Select,
  StatusBadge,
  controlClass,
  type StatusTone,
} from '@/components/ui';

const statusLabel: Record<EmailImportLog['status'], string> = {
  PROCESSED: 'Processado',
  SKIPPED_DUPLICATE: 'Duplicado',
  UNRECOGNIZED_TOKEN: 'Token não reconhecido',
  UNMAPPED_ACCOUNT: 'Conta não mapeada',
  ERROR: 'Erro',
};

const statusTone: Record<EmailImportLog['status'], StatusTone> = {
  PROCESSED: 'brand',
  SKIPPED_DUPLICATE: 'pending',
  UNRECOGNIZED_TOKEN: 'pending',
  UNMAPPED_ACCOUNT: 'pending',
  ERROR: 'pending',
};

export default function ImportAliasPage() {
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bankId, setBankId] = useState('');
  const [acctId, setAcctId] = useState('');
  const [accountId, setAccountId] = useState('');

  const alias = useQuery({
    queryKey: ['import-alias'],
    queryFn: () => api<ImportAlias>('/settings/import-alias'),
  });
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const mappings = useQuery({
    queryKey: ['bank-account-mappings'],
    queryFn: () => api<BankAccountMapping[]>('/bank-account-mappings'),
  });
  const logs = useQuery({
    queryKey: ['email-import-logs'],
    queryFn: () => api<EmailImportLog[]>('/settings/email-import-logs'),
  });

  const createMapping = useMutation({
    mutationFn: () =>
      api<BankAccountMapping>('/bank-account-mappings', {
        method: 'POST',
        body: JSON.stringify({ bankId, acctId, accountId }),
      }),
    onSuccess: async () => {
      setBankId('');
      setAcctId('');
      setAccountId('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['bank-account-mappings'] });
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível salvar o mapeamento.',
      );
    },
  });

  const removeMapping = useMutation({
    mutationFn: (id: string) => api(`/bank-account-mappings/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['bank-account-mappings'] });
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiError ? caught.message : 'Não foi possível excluir o mapeamento.',
      );
    },
  });

  async function copyAddress() {
    if (!alias.data) return;
    await navigator.clipboard.writeText(alias.data.address);
    setCopied(true);
    window.setTimeout(() => {
      setCopied(false);
    }, 2000);
  }

  return (
    <section className="space-y-8">
      <PageHeader
        title="Importação por email"
        description="Encaminhe o OFX do banco para o endereço exclusivo deste espaço. Qualquer membro pode encaminhar; a confirmação da prévia continua humana."
      />

      {error ? <Notice>{error}</Notice> : null}

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Endereço de encaminhamento</h2>
        {alias.isLoading ? (
          <p className="mt-3 text-sm text-ink-soft">Carregando endereço…</p>
        ) : null}
        {alias.data ? (
          <>
            <p className="mt-3 break-all font-medium text-ink">{alias.data.address}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button onClick={() => void copyAddress()}>
                {copied ? 'Copiado' : 'Copiar endereço'}
              </Button>
            </div>
            <ol className="mt-4 list-decimal space-y-1 pl-5 text-sm text-ink-soft">
              <li>No banco ou no Gmail, encaminhe o email do extrato para o endereço acima.</li>
              <li>
                O `+código` precisa permanecer no destinatário — a maioria dos provedores preserva.
              </li>
              <li>Quando o OFX chegar, o Orcadom avisa aqui para você revisar a prévia.</li>
            </ol>
          </>
        ) : null}
      </div>

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Mapeamento BANKID / ACCTID</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Na primeira vez o extrato chega sem conta. Depois de vincular, os próximos emails do mesmo
          banco caem direto na conta certa.
        </p>
        <form
          className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(event) => {
            event.preventDefault();
            createMapping.mutate();
          }}
        >
          <Field label="BANKID">
            <input
              className={controlClass}
              value={bankId}
              onChange={(event) => {
                setBankId(event.target.value);
              }}
              placeholder="0341"
            />
          </Field>
          <Field label="ACCTID">
            <input
              className={controlClass}
              value={acctId}
              onChange={(event) => {
                setAcctId(event.target.value);
              }}
              placeholder="12345-6"
            />
          </Field>
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
          <div className="flex items-end">
            <Button
              type="submit"
              className="w-full"
              disabled={createMapping.isPending || !bankId || !acctId || !accountId}
            >
              {createMapping.isPending ? 'Salvando…' : 'Vincular'}
            </Button>
          </div>
        </form>

        <ul className="mt-4 divide-y divide-hairline">
          {(mappings.data ?? []).length === 0 ? (
            <li className="py-3 text-sm text-ink-soft">Nenhum banco mapeado ainda.</li>
          ) : (
            mappings.data?.map((mapping) => (
              <li
                key={mapping.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <p className="text-sm text-ink">
                  {mapping.bankId} / {mapping.acctId}
                  <span className="text-ink-soft"> → {mapping.accountName}</span>
                </p>
                <Button
                  variant="ghost"
                  onClick={() => {
                    removeMapping.mutate(mapping.id);
                  }}
                >
                  Remover
                </Button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Histórico de emails</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Token não reconhecido e falhas ficam registrados aqui para revisão, sem sumir em silêncio.
        </p>
        <ul className="mt-4 divide-y divide-hairline">
          {(logs.data ?? []).length === 0 ? (
            <li className="py-3 text-sm text-ink-soft">Nenhum email processado ainda.</li>
          ) : (
            logs.data?.map((log) => (
              <li key={log.id} className="py-3 text-sm">
                <p className="flex flex-wrap items-center gap-2 text-ink">
                  <StatusBadge tone={statusTone[log.status]}>{statusLabel[log.status]}</StatusBadge>
                  {log.importBatchId ? (
                    <a
                      className="text-sm text-brand"
                      href={`/imports?batchId=${log.importBatchId}`}
                    >
                      abrir prévia
                    </a>
                  ) : null}
                </p>
                <p className="text-ink-soft">
                  {formatDate(log.createdAt)} · {log.recipientAddress}
                </p>
                {log.errorMessage ? <p className="mt-1 text-pending">{log.errorMessage}</p> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </section>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Field, Notice, PageHeader, Select, controlClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import type { Account } from '@/lib/models';

interface RemoteAccount {
  externalId: string;
  name: string;
  kind: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD';
  number: string;
  linkedAccountId: string | null;
}

interface MeuPluggyItem {
  id: string;
  status: string;
  institutionName: string;
  consentExpiresAt: string | null;
  accounts: RemoteAccount[];
}

interface MeuPluggyStatus {
  configured: boolean;
  clientId: string | null;
  items: MeuPluggyItem[];
  consentExpiresAt: string | null;
  lastSyncAt: string | null;
  consentWarning: 'ok' | 'expiring' | 'expired' | null;
  webhookPath: string | null;
}

const kindLabel: Record<RemoteAccount['kind'], string> = {
  CHECKING: 'Conta corrente',
  SAVINGS: 'Poupança',
  CREDIT_CARD: 'Cartão',
};

const steps = [
  'Crie uma conta em meu.pluggy.ai e conecte os seus bancos.',
  'No dashboard.pluggy.ai, crie uma aplicação.',
  'Em Demo, conecte pelo conector MeuPluggy, não pelo banco.',
  'Copie o Client ID, o Client Secret e os itemIds para o formulário abaixo.',
];

function message(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

export default function MeuPluggyPage() {
  const queryClient = useQueryClient();
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [itemIds, setItemIds] = useState('');
  const [mappings, setMappings] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [webhookPath, setWebhookPath] = useState<string | null>(null);

  const status = useQuery({
    queryKey: ['meupluggy-status'],
    queryFn: () => api<MeuPluggyStatus>('/open-finance/meupluggy/status'),
    retry: false,
  });
  const accounts = useQuery({
    queryKey: ['accounts'],
    queryFn: () => api<Account[]>('/accounts'),
    enabled: status.isSuccess,
  });

  const save = useMutation({
    mutationFn: () =>
      api<{ webhookPath: string }>('/open-finance/meupluggy/credentials', {
        method: 'PUT',
        body: JSON.stringify({
          clientId,
          clientSecret,
          itemIds: itemIds.split(/[\s,]+/).filter((item) => item.length > 0),
        }),
      }),
    onSuccess: async (saved) => {
      setClientSecret('');
      setWebhookPath(saved.webhookPath);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['meupluggy-status'] });
    },
    onError: (caught: unknown) => {
      setError(message(caught, 'Não foi possível salvar as credenciais.'));
    },
  });

  const sync = useMutation({
    mutationFn: () => {
      const chosen = Object.entries(mappings)
        .filter((entry) => entry[1])
        .map(([externalId, accountId]) => ({ externalId, accountId }));
      return api('/open-finance/meupluggy/sync', {
        method: 'POST',
        body: JSON.stringify({ accounts: chosen }),
      });
    },
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['meupluggy-status'] });
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
    onError: (caught: unknown) => {
      setError(message(caught, 'Não foi possível sincronizar.'));
    },
  });

  const remove = useMutation({
    mutationFn: () => api('/open-finance/meupluggy/credentials', { method: 'DELETE' }),
    onSuccess: async () => {
      setWebhookPath(null);
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['meupluggy-status'] });
    },
    onError: (caught: unknown) => {
      setError(message(caught, 'Não foi possível remover as credenciais.'));
    },
  });

  if (status.isError && status.error instanceof ApiError && status.error.status === 404) {
    return (
      <section className="space-y-6">
        <PageHeader title="Meu Pluggy" description="Uso pessoal, desligado neste servidor." />
        <Notice>O Meu Pluggy não está habilitado. Em um produto comercial ele permanece desligado.</Notice>
      </section>
    );
  }

  const data = status.data;
  const remoteAccounts = data?.items.flatMap((item) => item.accounts) ?? [];
  const shownWebhook = webhookPath ?? data?.webhookPath ?? null;

  return (
    <section className="space-y-6">
      <PageHeader
        title="Meu Pluggy"
        description="Lê só as contas que você mesmo conectou. Não use isto num deploy comercial."
      />
      <ol className="list-decimal space-y-2 px-5 text-sm text-ink-soft">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {data?.consentWarning === 'expiring' ? (
        <Notice>A autorização do Meu Pluggy vence em até 30 dias. Conecte de novo no Dashboard.</Notice>
      ) : null}
      {data?.consentWarning === 'expired' ? (
        <Notice>A autorização do Meu Pluggy venceu. Repita a conexão pelo conector MeuPluggy.</Notice>
      ) : null}
      {error ? <Notice>{error}</Notice> : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          save.mutate();
        }}
      >
        <Field label="Client ID">
          <input
            className={controlClass}
            value={clientId}
            onChange={(event) => {
              setClientId(event.target.value);
            }}
          />
        </Field>
        <Field label="Client Secret">
          <input
            className={controlClass}
            type="password"
            autoComplete="off"
            value={clientSecret}
            onChange={(event) => {
              setClientSecret(event.target.value);
            }}
          />
        </Field>
        <Field label="itemIds, um por linha">
          <textarea
            className={controlClass}
            rows={4}
            value={itemIds}
            onChange={(event) => {
              setItemIds(event.target.value);
            }}
          />
        </Field>
        <Button type="submit" disabled={save.isPending}>
          Salvar credenciais
        </Button>
      </form>
      {shownWebhook ? (
        <Field label="Caminho do webhook. Coloque na frente o endereço público da API.">
          <input className={controlClass} readOnly value={shownWebhook} />
        </Field>
      ) : null}
      {data?.configured ? (
        <div className="space-y-4">
          <p className="text-sm text-ink-soft">
            Client ID salvo: {data.clientId}. Última leitura: {data.lastSyncAt ?? 'ainda não houve'}.
          </p>
          {data.items.map((item) => (
            <article key={item.id} className="space-y-3 rounded-lg bg-surface px-5 py-4">
              <p className="text-sm font-medium text-ink">
                {item.institutionName} · {item.status}
              </p>
              {item.accounts.map((account) => (
                <Field key={account.externalId} label={`${account.name} ${account.number} (${kindLabel[account.kind]})`}>
                  <Select
                    value={mappings[account.externalId] ?? account.linkedAccountId ?? ''}
                    onChange={(event) => {
                      setMappings((current) => ({ ...current, [account.externalId]: event.target.value }));
                    }}
                  >
                    <option value="">Escolher conta do Orcadom</option>
                    {(accounts.data ?? []).map((local) => (
                      <option key={local.id} value={local.id}>
                        {local.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ))}
            </article>
          ))}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              disabled={sync.isPending || remoteAccounts.length === 0}
              onClick={() => {
                sync.mutate();
              }}
            >
              Sincronizar
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={remove.isPending}
              onClick={() => {
                remove.mutate();
              }}
            >
              Remover credenciais
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

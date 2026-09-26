'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import type { HouseholdInvite, HouseholdMembersResponse } from '@/lib/models';
import { useHousehold } from '@/components/household-provider';
import { Button, Field, Notice, PageHeader, StatusBadge, controlClass } from '@/components/ui';

export default function HouseholdSettingsPage() {
  const queryClient = useQueryClient();
  const { household, households } = useHousehold();
  const [name, setName] = useState(household?.name ?? '');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const isOwner = household?.role === 'OWNER';

  useEffect(() => {
    if (household?.name) setName(household.name);
  }, [household?.name]);

  const members = useQuery({
    queryKey: ['household-members', household?.id],
    enabled: Boolean(household?.id),
    queryFn: () => api<HouseholdMembersResponse>(`/households/${household?.id ?? ''}/members`),
  });

  const rename = useMutation({
    mutationFn: () =>
      api(`/households/${household?.id ?? ''}`, {
        method: 'PATCH',
        body: JSON.stringify({ name }),
      }),
    onSuccess: async () => {
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['households'] });
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível renomear.');
    },
  });

  const invite = useMutation({
    mutationFn: () =>
      api<HouseholdInvite>(`/households/${household?.id ?? ''}/invites`, {
        method: 'POST',
        body: JSON.stringify({ email }),
      }),
    onSuccess: async () => {
      setEmail('');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['household-members', household?.id] });
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível convidar.');
    },
  });

  const removeMember = useMutation({
    mutationFn: (userId: string) =>
      api(`/households/${household?.id ?? ''}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['household-members', household?.id] });
      await queryClient.invalidateQueries({ queryKey: ['households'] });
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível remover o membro.');
    },
  });

  async function copyInvite(token: string) {
    const url = `${window.location.origin}/invite/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(token);
    window.setTimeout(() => {
      setCopied(null);
    }, 2000);
  }

  return (
    <section className="space-y-8">
      <PageHeader
        title="Família / espaço"
        description={`Contas, orçamentos e lançamentos são compartilhados neste espaço.${households.length > 1 ? ' Troque de espaço pelo seletor do cabeçalho.' : ''}`}
      />

      {error ? <Notice>{error}</Notice> : null}

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Nome do espaço</h2>
        {isOwner ? (
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row"
            onSubmit={(event) => {
              event.preventDefault();
              rename.mutate();
            }}
          >
            <input
              className={`${controlClass} max-w-sm`}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
            <Button type="submit" disabled={rename.isPending || !name.trim()}>
              {rename.isPending ? 'Salvando…' : 'Renomear'}
            </Button>
          </form>
        ) : (
          <p className="mt-3 font-medium text-ink">{household?.name}</p>
        )}
      </div>

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Membros</h2>
        <ul className="mt-4 divide-y divide-hairline">
          {(members.data?.members ?? []).map((member) => (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-3 py-3"
            >
              <div>
                <p className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  {member.name}
                  <StatusBadge tone={member.role === 'OWNER' ? 'brand' : 'neutral'}>
                    {member.role === 'OWNER' ? 'responsável' : 'membro'}
                  </StatusBadge>
                </p>
                <p className="text-sm text-ink-soft">{member.email}</p>
              </div>
              {isOwner ? (
                <Button
                  variant="ghost"
                  onClick={() => {
                    removeMember.mutate(member.userId);
                  }}
                >
                  Remover
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>

      {isOwner ? (
        <div className="rounded-lg bg-surface p-6">
          <h2 className="font-display text-h2 font-medium">Convites</h2>
          <p className="mt-2 text-sm text-ink-soft">
            A pessoa precisa criar (ou já ter) uma conta com o mesmo e-mail e abrir o link do
            convite.
          </p>
          <form
            className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              invite.mutate();
            }}
          >
            <Field label="E-mail">
              <input
                type="email"
                className={controlClass}
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value);
                }}
                placeholder="pessoa@email.com"
              />
            </Field>
            <div className="flex items-end">
              <Button type="submit" disabled={invite.isPending || !email.trim()}>
                {invite.isPending ? 'Enviando…' : 'Gerar convite'}
              </Button>
            </div>
          </form>
          <ul className="mt-4 divide-y divide-hairline">
            {(members.data?.invites ?? []).length === 0 ? (
              <li className="py-3 text-sm text-ink-soft">Nenhum convite pendente.</li>
            ) : (
              members.data?.invites.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <p className="text-sm text-ink">
                    {item.email}
                    <span className="ml-2 text-ink-soft">até {formatDate(item.expiresAt)}</span>
                  </p>
                  <Button variant="ghost" onClick={() => void copyInvite(item.token)}>
                    {copied === item.token ? 'Copiado' : 'Copiar link'}
                  </Button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

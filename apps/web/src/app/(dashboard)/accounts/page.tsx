'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAccountSchema, restrictAccountSchema, updateAccountSchema } from '@orcadom/types';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { EntityAudit } from '@/components/entity-audit';
import { useHousehold } from '@/components/household-provider';
import {
  AccountCard,
  Button,
  EmptyState,
  Field,
  Modal,
  Notice,
  PageHeader,
  Select,
  controlClass,
} from '@/components/ui';
import { invalidateOnboarding } from '@/hooks/useOnboardingStatus';
import { ApiError, api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { accountTypeLabels, type AccountType } from '@/lib/labels';
import type { Account, AccountAccessResponse, HouseholdMembersResponse, PublicUser } from '@/lib/models';
import { colors } from '@/lib/tokens';
import { useOpenFromQuery } from '@/lib/use-open-from-query';

interface AccountForm {
  name: string;
  type: AccountType;
  balance: string;
  color: string;
}

const emptyForm: AccountForm = { name: '', type: 'WALLET', balance: '', color: colors.brand };

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const { household } = useHousehold();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const members = useQuery({
    queryKey: ['household-members', household?.id],
    enabled: Boolean(household?.id),
    queryFn: () => api<HouseholdMembersResponse>(`/households/${household?.id ?? ''}/members`),
  });
  const [editing, setEditing] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [restricting, setRestricting] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canRestrict = (members.data?.members.length ?? 0) > 1;
  const form = useForm<AccountForm>({ defaultValues: emptyForm });

  const openCreate = useCallback(() => {
    setEditing(null);
    form.reset(emptyForm);
    setError(null);
    setOpen(true);
  }, [form]);
  useOpenFromQuery(openCreate);

  function closeForm() {
    setOpen(false);
    setEditing(null);
    setError(null);
    form.reset(emptyForm);
  }

  const save = useMutation({
    mutationFn: async (values: AccountForm) => {
      if (editing) {
        const parsed = updateAccountSchema.safeParse({
          name: values.name,
          color: values.color || null,
        });
        if (!parsed.success) {
          throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
        }
        return api(`/accounts/${editing.id}`, {
          method: 'PATCH',
          body: JSON.stringify(parsed.data),
        });
      }
      const parsed = createAccountSchema.safeParse({
        name: values.name,
        type: values.type,
        balance: values.balance === '' ? undefined : Number(values.balance),
        color: values.color || undefined,
      });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Valor inválido.'), 400);
      }
      return api('/accounts', { method: 'POST', body: JSON.stringify(parsed.data) });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await queryClient.invalidateQueries({ queryKey: ['audit-logs'] });
      await invalidateOnboarding(queryClient);
      closeForm();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível salvar a conta.');
    },
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`/accounts/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['accounts'] });
      await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      await invalidateOnboarding(queryClient);
      setPendingDelete(null);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível excluir a conta.');
      setPendingDelete(null);
    },
  });

  return (
    <section>
      <PageHeader title="Contas">
        <Button onClick={openCreate}>Nova conta</Button>
      </PageHeader>
      {error && !open && !restricting ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      {accounts.isLoading ? <p className="mt-6 text-ink-soft">Carregando contas…</p> : null}
      {accounts.data?.length === 0 ? (
        <EmptyState title="Nenhuma conta ainda">
          Crie a primeira para lançar movimentos ou importar um extrato.
        </EmptyState>
      ) : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        {accounts.data?.map((account) => (
          <AccountCard
            key={account.id}
            name={account.name}
            type={account.type}
            balance={account.balance}
            color={account.color}
            restricted={account.isRestricted}
          >
            <Button
              variant="secondary"
              onClick={() => {
                setEditing(account);
                form.reset({
                  name: account.name,
                  type: account.type,
                  balance: account.balance,
                  color: account.color ?? colors.brand,
                });
                setError(null);
                setOpen(true);
              }}
            >
              Editar
            </Button>
            {canRestrict ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setError(null);
                  setRestricting(account);
                }}
              >
                Restringir
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => {
                setError(null);
                setPendingDelete(account);
              }}
            >
              Excluir
            </Button>
          </AccountCard>
        ))}
      </div>

      <Modal open={open} title={editing ? 'Editar conta' : 'Nova conta'} onClose={closeForm}>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            void form.handleSubmit((values) => {
              save.mutate(values);
            })(event);
          }}
        >
          {error ? <Notice>{error}</Notice> : null}
          <Field label="Nome">
            <input className={controlClass} {...form.register('name')} />
          </Field>
          {editing ? (
            <p className="text-sm text-ink-soft">
              Tipo: {accountTypeLabels[editing.type]}. O saldo muda pelos lançamentos.
            </p>
          ) : (
            <>
              <Field label="Tipo">
                <Select {...form.register('type')}>
                  {Object.entries(accountTypeLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Saldo inicial">
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  className={`${controlClass} tabular-nums`}
                  {...form.register('balance')}
                />
              </Field>
            </>
          )}
          <Field label="Cor">
            <input
              type="color"
              className="h-10 w-16 rounded-sm bg-surface-sunken"
              {...form.register('color')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={closeForm}>
              Cancelar
            </Button>
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? 'Salvando…' : 'Salvar'}
            </Button>
          </div>
        </form>
        {editing ? <EntityAudit entityType="Account" entityId={editing.id} /> : null}
      </Modal>

      <Modal
        open={Boolean(pendingDelete)}
        title="Excluir conta"
        onClose={() => {
          setPendingDelete(null);
        }}
      >
        <p className="text-sm text-ink-soft">
          Excluir {pendingDelete?.name}? Contas com lançamentos vinculados permanecem.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            variant="ghost"
            onClick={() => {
              setPendingDelete(null);
            }}
          >
            Cancelar
          </Button>
          <Button
            disabled={remove.isPending}
            onClick={() => {
              if (pendingDelete) remove.mutate(pendingDelete.id);
            }}
          >
            {remove.isPending ? 'Excluindo…' : 'Excluir'}
          </Button>
        </div>
      </Modal>

      <RestrictAccountModal
        account={restricting}
        error={error}
        onClose={() => {
          setRestricting(null);
          setError(null);
        }}
        onError={setError}
      />
    </section>
  );
}

function RestrictAccountModal({
  account,
  error,
  onClose,
  onError,
}: {
  account: Account | null;
  error: string | null;
  onClose: () => void;
  onError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const { household } = useHousehold();
  const [selected, setSelected] = useState<string[]>([]);

  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<PublicUser>('/profile'),
    enabled: Boolean(account),
  });
  const members = useQuery({
    queryKey: ['household-members', household?.id],
    enabled: Boolean(account && household?.id),
    queryFn: () => api<HouseholdMembersResponse>(`/households/${household?.id ?? ''}/members`),
  });
  const access = useQuery({
    queryKey: ['account-access', account?.id],
    enabled: Boolean(account),
    queryFn: () => api<AccountAccessResponse>(`/accounts/${account?.id ?? ''}/access`),
  });

  const currentMemberId = useMemo(
    () => members.data?.members.find((member) => member.userId === me.data?.id)?.id ?? null,
    [me.data?.id, members.data?.members],
  );

  useEffect(() => {
    if (!account || !currentMemberId) return;
    if (account.isRestricted && access.data) {
      const ids = access.data.members.map((member) => member.id);
      setSelected(ids.includes(currentMemberId) ? ids : [...ids, currentMemberId]);
      return;
    }
    if (!account.isRestricted) {
      setSelected([currentMemberId]);
    }
  }, [access.data, account, currentMemberId]);

  async function invalidateAccountViews() {
    await queryClient.invalidateQueries({ queryKey: ['accounts'] });
    await queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    if (account) {
      await queryClient.invalidateQueries({ queryKey: ['account-access', account.id] });
    }
  }

  const restrict = useMutation({
    mutationFn: async () => {
      if (!account) throw new ApiError('Conta não encontrada.', 404);
      const parsed = restrictAccountSchema.safeParse({ householdMemberIds: selected });
      if (!parsed.success) {
        throw new ApiError(humanize(parsed.error.issues[0]?.message ?? 'Selecione ao menos um membro.'), 400);
      }
      return api(`/accounts/${account.id}/restrict`, {
        method: 'PATCH',
        body: JSON.stringify(parsed.data),
      });
    },
    onSuccess: async () => {
      onError(null);
      await invalidateAccountViews();
      onClose();
    },
    onError: (caught: unknown) => {
      onError(caught instanceof ApiError ? caught.message : 'Não foi possível restringir a conta.');
    },
  });

  const unrestrict = useMutation({
    mutationFn: () => {
      if (!account) throw new ApiError('Conta não encontrada.', 404);
      return api(`/accounts/${account.id}/unrestrict`, { method: 'PATCH' });
    },
    onSuccess: async () => {
      onError(null);
      await invalidateAccountViews();
      onClose();
    },
    onError: (caught: unknown) => {
      onError(caught instanceof ApiError ? caught.message : 'Não foi possível tornar a conta compartilhada.');
    },
  });

  function toggleMember(id: string, checked: boolean) {
    if (id === currentMemberId) return;
    setSelected((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((item) => item !== id);
    });
  }

  return (
    <Modal open={Boolean(account)} title="Restringir conta" onClose={onClose}>
      <p className="text-sm text-ink-soft">
        Só quem estiver marcado continua vendo {account?.name}. O valor ainda pode entrar em
        orçamentos compartilhados.
      </p>
      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}
      <ul className="mt-4 divide-y divide-hairline">
        {members.data?.members.map((member) => {
          const locked = member.id === currentMemberId;
          return (
            <li key={member.id}>
              <label className="flex min-h-11 items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.includes(member.id)}
                  disabled={locked}
                  onChange={(event) => {
                    toggleMember(member.id, event.target.checked);
                  }}
                />
                <span>
                  {member.name}
                  {locked ? ' (você)' : ''}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-4 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          Cancelar
        </Button>
        {account?.isRestricted ? (
          <Button
            variant="ghost"
            disabled={unrestrict.isPending}
            onClick={() => {
              unrestrict.mutate();
            }}
          >
            {unrestrict.isPending ? 'Liberando…' : 'Tornar compartilhada'}
          </Button>
        ) : null}
        <Button
          disabled={restrict.isPending}
          onClick={() => {
            restrict.mutate();
          }}
        >
          {restrict.isPending
            ? 'Salvando…'
            : account?.isRestricted
              ? 'Atualizar acesso'
              : 'Restringir'}
        </Button>
      </div>
    </Modal>
  );
}

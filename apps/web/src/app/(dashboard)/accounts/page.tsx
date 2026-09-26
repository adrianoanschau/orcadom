'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createAccountSchema, updateAccountSchema } from '@orcadom/types';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { accountTypeLabels, type AccountType } from '@/lib/labels';
import type { Account } from '@/lib/models';
import { EntityAudit } from '@/components/entity-audit';
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
import { colors } from '@/lib/tokens';

interface AccountForm {
  name: string;
  type: AccountType;
  balance: string;
  color: string;
}

const emptyForm: AccountForm = { name: '', type: 'WALLET', balance: '', color: colors.brand };

export default function AccountsPage() {
  const queryClient = useQueryClient();
  const accounts = useQuery({ queryKey: ['accounts'], queryFn: () => api<Account[]>('/accounts') });
  const [editing, setEditing] = useState<Account | null>(null);
  const [open, setOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Account | null>(null);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<AccountForm>({ defaultValues: emptyForm });

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
        <Button
          onClick={() => {
            setEditing(null);
            form.reset(emptyForm);
            setError(null);
            setOpen(true);
          }}
        >
          Nova conta
        </Button>
      </PageHeader>
      {error && !open ? (
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
    </section>
  );
}

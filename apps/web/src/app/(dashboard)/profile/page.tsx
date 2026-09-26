'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { LocalePreference } from '@orcadom/types';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Avatar } from '@/components/avatar';
import { useLocale } from '@/components/locale-provider';
import { Button, Field, Notice, PageHeader, Select, controlClass } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { localeOptions, parseLocalePreference } from '@/lib/locale';
import type { PublicUser } from '@/lib/models';

const nameSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(72),
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  });

type NameForm = z.infer<typeof nameSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

export default function ProfilePage() {
  const queryClient = useQueryClient();
  const { preference, setPreference } = useLocale();
  const [nameMessage, setNameMessage] = useState<string | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [localeMessage, setLocaleMessage] = useState<string | null>(null);
  const me = useQuery({
    queryKey: ['me'],
    queryFn: () => api<PublicUser>('/auth/me'),
  });

  const nameForm = useForm<NameForm>({
    resolver: zodResolver(nameSchema),
    defaultValues: { name: '' },
  });
  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  useEffect(() => {
    if (me.data?.name) nameForm.reset({ name: me.data.name });
  }, [me.data?.name, nameForm]);

  const saveName = useMutation({
    mutationFn: (values: NameForm) =>
      api<PublicUser>('/auth/me', { method: 'PATCH', body: JSON.stringify(values) }),
    onSuccess: async (user) => {
      setNameMessage('Nome atualizado.');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
      nameForm.reset({ name: user.name });
    },
    onError: (caught: unknown) => {
      setNameMessage(
        caught instanceof ApiError ? caught.message : 'Não foi possível salvar o nome.',
      );
    },
  });

  const savePassword = useMutation({
    mutationFn: (values: PasswordForm) =>
      api<PublicUser>('/auth/me', {
        method: 'PATCH',
        body: JSON.stringify({
          currentPassword: values.currentPassword,
          newPassword: values.newPassword,
        }),
      }),
    onSuccess: () => {
      setPasswordMessage('Senha atualizada.');
      passwordForm.reset();
    },
    onError: (caught: unknown) => {
      setPasswordMessage(
        caught instanceof ApiError ? caught.message : 'Não foi possível atualizar a senha.',
      );
    },
  });

  const saveLocale = useMutation({
    mutationFn: (locale: LocalePreference) =>
      api<PublicUser>('/auth/me', { method: 'PATCH', body: JSON.stringify({ locale }) }),
    onSuccess: async (user) => {
      const next = parseLocalePreference(user.locale);
      setPreference(next);
      setLocaleMessage('Localidade atualizada.');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (caught: unknown) => {
      setLocaleMessage(
        caught instanceof ApiError ? caught.message : 'Não foi possível salvar a localidade.',
      );
    },
  });

  const user = me.data;

  return (
    <section className="space-y-8">
      <PageHeader title="Perfil" description="Seus dados de conta no Orcadom." />

      <div className="rounded-lg bg-surface p-6">
        <div className="flex items-center gap-4">
          <Avatar name={user?.name ?? ''} size="lg" />
          <div className="min-w-0">
            <p className="font-display text-h2 font-medium text-ink">{user?.name ?? '…'}</p>
            <p className="truncate text-sm text-ink-soft">{user?.email}</p>
            {user?.createdAt ? (
              <p className="mt-1 text-xs text-ink-faint">
                Conta desde {formatDate(user.createdAt)}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Nome</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            void nameForm.handleSubmit((values) => {
              setNameMessage(null);
              saveName.mutate(values);
            })(event);
          }}
        >
          {nameMessage ? <Notice>{nameMessage}</Notice> : null}
          <Field label="Nome" error={nameForm.formState.errors.name?.message}>
            <input autoComplete="name" className={controlClass} {...nameForm.register('name')} />
          </Field>
          <Button type="submit" disabled={saveName.isPending || !nameForm.formState.isDirty}>
            {saveName.isPending ? 'Salvando…' : 'Salvar nome'}
          </Button>
        </form>
      </div>

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Localidade</h2>
        <p className="mt-2 text-sm text-ink-soft">
          Define o idioma das datas e dos calendários. O restante do site continua em português.
        </p>
        <div className="mt-4 space-y-3">
          {localeMessage ? <Notice>{localeMessage}</Notice> : null}
          <Field label="Formato de datas">
            <Select
              value={preference}
              disabled={saveLocale.isPending}
              onChange={(event) => {
                const next = parseLocalePreference(event.target.value);
                setPreference(next);
                setLocaleMessage(null);
                saveLocale.mutate(next);
              }}
            >
              {localeOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <p className="text-xs text-ink-soft">
            {localeOptions.find((option) => option.value === preference)?.hint}
          </p>
        </div>
      </div>

      <div className="rounded-lg bg-surface p-6">
        <h2 className="font-display text-h2 font-medium">Senha</h2>
        <form
          className="mt-4 space-y-4"
          onSubmit={(event) => {
            void passwordForm.handleSubmit((values) => {
              setPasswordMessage(null);
              savePassword.mutate(values);
            })(event);
          }}
        >
          {passwordMessage ? <Notice>{passwordMessage}</Notice> : null}
          <Field label="Senha atual" error={passwordForm.formState.errors.currentPassword?.message}>
            <input
              type="password"
              autoComplete="current-password"
              className={controlClass}
              {...passwordForm.register('currentPassword')}
            />
          </Field>
          <Field label="Nova senha" error={passwordForm.formState.errors.newPassword?.message}>
            <input
              type="password"
              autoComplete="new-password"
              className={controlClass}
              {...passwordForm.register('newPassword')}
            />
            <span className="mt-1 block text-xs text-ink-soft">Mínimo de 8 caracteres.</span>
          </Field>
          <Field
            label="Confirmar nova senha"
            error={passwordForm.formState.errors.confirmPassword?.message}
          >
            <input
              type="password"
              autoComplete="new-password"
              className={controlClass}
              {...passwordForm.register('confirmPassword')}
            />
          </Field>
          <Button type="submit" disabled={savePassword.isPending}>
            {savePassword.isPending ? 'Atualizando…' : 'Atualizar senha'}
          </Button>
        </form>
      </div>
    </section>
  );
}

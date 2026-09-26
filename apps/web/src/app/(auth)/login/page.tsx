'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginDto } from '@orcadom/types';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Button, Field, Notice, controlClass } from '@/components/ui';

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<LoginDto>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  return (
    <section className="w-full max-w-md rounded-lg bg-surface p-6 sm:p-8">
      <p className="text-sm font-medium text-brand">Orcadom</p>
      <h1 className="mt-2 font-display text-h1 font-semibold">Entrar</h1>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          void form.handleSubmit(async (values) => {
            setError(null);
            try {
              await api('/auth/login', { method: 'POST', body: JSON.stringify(values) });
              window.location.assign('/dashboard');
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : 'Não foi possível entrar.');
            }
          })(event);
        }}
      >
        {error ? <Notice>{error}</Notice> : null}
        <Field label="E-mail" error={humanize(form.formState.errors.email?.message ?? '')}>
          <input
            type="email"
            autoComplete="email"
            className={controlClass}
            {...form.register('email')}
          />
        </Field>
        <Field label="Senha" error={humanize(form.formState.errors.password?.message ?? '')}>
          <input
            type="password"
            autoComplete="current-password"
            className={controlClass}
            {...form.register('password')}
          />
        </Field>
        <label className="flex min-h-11 items-start gap-2 text-sm text-ink">
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0 accent-brand"
            {...form.register('rememberMe')}
          />
          <span>
            Lembrar login neste dispositivo
            <span className="mt-0.5 block text-ink-soft">
              Mantém a sessão por 30 dias. Sem marcar, ela vale até fechar o navegador
              (no máximo 12 horas).
            </span>
          </span>
        </label>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        Ainda não tem conta?{' '}
        <Link href="/register" className="text-brand">
          Cadastre-se
        </Link>
      </p>
    </section>
  );
}

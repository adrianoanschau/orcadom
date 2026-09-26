'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema, type RegisterDto } from '@orcadom/types';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { ApiError, api } from '@/lib/api';
import { humanize } from '@/lib/format';
import { Button, Field, Notice, controlClass } from '@/components/ui';

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const form = useForm<RegisterDto>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  return (
    <section className="w-full max-w-md rounded-lg bg-surface p-6 sm:p-8">
      <p className="text-sm font-medium text-brand">Orcadom</p>
      <h1 className="mt-2 font-display text-h1 font-semibold">Criar conta</h1>
      <form
        className="mt-6 space-y-4"
        onSubmit={(event) => {
          void form.handleSubmit(async (values) => {
            setError(null);
            try {
              await api('/auth/register', { method: 'POST', body: JSON.stringify(values) });
              window.location.assign('/dashboard');
            } catch (caught) {
              setError(caught instanceof ApiError ? caught.message : 'Não foi possível cadastrar.');
            }
          })(event);
        }}
      >
        {error ? <Notice>{error}</Notice> : null}
        <Field label="Nome" error={humanize(form.formState.errors.name?.message ?? '')}>
          <input autoComplete="name" className={controlClass} {...form.register('name')} />
        </Field>
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
            autoComplete="new-password"
            className={controlClass}
            {...form.register('password')}
          />
        </Field>
        <Button type="submit" className="w-full" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Criando…' : 'Criar conta'}
        </Button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        Já tem conta?{' '}
        <Link href="/login" className="text-brand">
          Entrar
        </Link>
      </p>
    </section>
  );
}

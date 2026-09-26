'use client';

import { useMutation } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ApiError, api, setActiveHouseholdId } from '@/lib/api';
import { Button, Notice } from '@/components/ui';

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const accept = useMutation({
    mutationFn: () =>
      api<{ id: string; name: string }>(`/households/invites/${params.token}/accept`, {
        method: 'POST',
      }),
    onSuccess: (household) => {
      setActiveHouseholdId(household.id);
      router.replace('/dashboard');
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiError ? caught.message : 'Não foi possível aceitar o convite.');
    },
  });

  return (
    <section className="mx-auto max-w-lg space-y-4">
      <h1 className="font-display text-h1 font-semibold">Convite para um espaço</h1>
      <p className="text-sm text-ink-soft">
        Ao aceitar, você passa a ver as mesmas contas, categorias e lançamentos desta família.
      </p>
      {error ? <Notice>{error}</Notice> : null}
      <Button
        disabled={accept.isPending}
        onClick={() => {
          accept.mutate();
        }}
      >
        {accept.isPending ? 'Entrando…' : 'Aceitar convite'}
      </Button>
    </section>
  );
}

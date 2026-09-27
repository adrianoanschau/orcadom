'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { checklistFromStatus, essentialProgress } from '@/lib/onboarding';
import type { OnboardingStatus } from '@/lib/models';
import { CheckIcon, ChevronIcon } from './icons';
import { Button, Modal, ProgressBar } from './ui';

export function useOnboardingStatus() {
  return useQuery({
    queryKey: ['onboarding'],
    queryFn: () => api<OnboardingStatus>('/onboarding/status'),
  });
}

export function OnboardingChecklist() {
  const queryClient = useQueryClient();
  const onboarding = useOnboardingStatus();
  const status = onboarding.data;

  const dismiss = useMutation({
    mutationFn: () =>
      api<OnboardingStatus>('/onboarding/dismiss', { method: 'PATCH' }),
    onSuccess: (next) => {
      queryClient.setQueryData(['onboarding'], next);
    },
  });

  const acknowledge = useMutation({
    mutationFn: () => api<OnboardingStatus>('/onboarding/resume', { method: 'PATCH' }),
    onSuccess: (next) => {
      queryClient.setQueryData(['onboarding'], next);
    },
  });

  if (!status || status.dismissedAt) return null;

  const { essentials, deepening, orientation } = checklistFromStatus(status);
  const progress = essentialProgress(essentials);
  const essentialsDone = progress.total > 0 && progress.done === progress.total;
  const hasBody = essentials.length + deepening.length + orientation.length > 0;
  if (!hasBody) return null;

  return (
    <>
      <section className="rounded-lg bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-h2 font-medium">
              {status.viewerIsInvited ? 'Explore este espaço' : 'Primeiros passos'}
            </h2>
            {progress.total > 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                {progress.done} de {progress.total} passos essenciais concluídos
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                Este espaço já tem movimento. Veja o que ainda falta ou o histórico da casa.
              </p>
            )}
          </div>
          <Button
            variant="ghost"
            className="shrink-0"
            disabled={dismiss.isPending}
            onClick={() => {
              dismiss.mutate();
            }}
          >
            Dispensar
          </Button>
        </div>

        {progress.total > 0 ? (
          <div className="mt-4">
            <ProgressBar
              ratio={progress.done / progress.total}
              label={`${String(progress.done)} de ${String(progress.total)} passos essenciais`}
            />
          </div>
        ) : null}

        {essentials.length > 0 ? (
          <ChecklistItems items={essentials} className="mt-4" />
        ) : null}

        {deepening.length > 0 ? (
          <DeepeningSection items={deepening} collapsedByDefault={progress.total > 0 && essentialsDone} />
        ) : null}

        {orientation.length > 0 ? (
          <div className="mt-5">
            <p className="text-sm font-medium text-ink">Orientação</p>
            <ChecklistItems items={orientation} className="mt-2" />
          </div>
        ) : null}
      </section>

      <WelcomeModal
        open={status.showWelcome}
        onClose={() => {
          acknowledge.mutate();
        }}
      />
    </>
  );
}

function WelcomeModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  return (
    <Modal open={open} title="Bem-vindo ao Orcadom" onClose={onClose}>
      <p className="text-sm text-ink-soft">
        Este é o espaço da casa para contas, lançamentos e o mês. Nada fica bloqueado — você pode
        explorar agora ou seguir o checklist no painel.
      </p>
      <p className="mt-3 text-sm text-ink-soft">Comece pela primeira conta financeira.</p>
      <div className="mt-5 flex justify-end">
        <Button
          onClick={() => {
            onClose();
            router.push('/accounts?new=1');
          }}
        >
          Criar minha primeira conta
        </Button>
      </div>
    </Modal>
  );
}

function DeepeningSection({
  items,
  collapsedByDefault,
}: {
  items: { id: string; title: string; href: string; completed?: boolean }[];
  collapsedByDefault: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  return (
    <div className="mt-5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-medium text-ink"
        aria-expanded={open}
        onClick={() => {
          setOpen((current) => !current);
        }}
      >
        Aprofundar
        <span className={open ? 'rotate-180 text-ink-soft' : 'text-ink-soft'}>
          <ChevronIcon />
        </span>
      </button>
      {open ? <ChecklistItems items={items} className="mt-2" /> : null}
    </div>
  );
}

function ChecklistItems({
  items,
  className = '',
}: {
  items: { id: string; title: string; href: string; completed?: boolean }[];
  className?: string;
}) {
  return (
    <ul className={`space-y-1 ${className}`}>
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={item.href}
            className="flex items-center gap-3 rounded-sm px-2 py-2 text-sm text-ink hover:bg-surface-sunken"
          >
            <span
              className={`inline-flex size-6 shrink-0 items-center justify-center rounded-pill ${
                item.completed ? 'bg-income/15 text-income' : 'border border-hairline text-ink-soft'
              }`}
              aria-hidden
            >
              {item.completed ? <CheckIcon /> : null}
            </span>
            <span className={item.completed ? 'text-ink-soft line-through' : ''}>{item.title}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

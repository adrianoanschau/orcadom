'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { api } from '@/lib/api';
import { checklistFromStatus, essentialProgress } from '@/lib/onboarding';
import type { OnboardingStatus } from '@/lib/models';
import { onboardingQueryKey, useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { CheckIcon, ChevronIcon } from './icons';
import { Button, Modal, ProgressBar } from './ui';

export function OnboardingChecklist() {
  const queryClient = useQueryClient();
  const onboarding = useOnboardingStatus();
  const status = onboarding.data;

  const dismiss = useMutation({
    mutationFn: () => api<OnboardingStatus>('/onboarding/dismiss', { method: 'PATCH' }),
    onSuccess: (next) => {
      queryClient.setQueryData(onboardingQueryKey, next);
    },
  });

  if (!onboarding.isSuccess || !status || status.dismissedAt) return null;

  const { essentials, deepening, orientation, skipEssentials } = checklistFromStatus(status);
  const progress = essentialProgress(essentials);
  const essentialsDone = status.steps.hasAccount && status.steps.hasTransaction;
  const showDeepening = essentialsDone && deepening.length > 0;

  return (
    <>
      <section className="rounded-lg bg-surface p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-h2 font-medium">
              {skipEssentials ? 'Explore este espaço' : 'Primeiros passos'}
            </h2>
            {essentials.length > 0 ? (
              <p className="mt-2 text-sm text-ink-soft">
                {progress.done} de {progress.total} passos essenciais concluídos
              </p>
            ) : (
              <p className="mt-2 text-sm text-ink-soft">
                Este espaço já tem movimento. Explore o painel ou veja o histórico da casa.
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

        {essentials.length > 0 ? (
          <div className="mt-4">
            <ProgressBar
              ratio={progress.total === 0 ? 0 : progress.done / progress.total}
              label={`${String(progress.done)} de ${String(progress.total)} passos essenciais`}
            />
          </div>
        ) : null}

        {essentials.length > 0 ? <ChecklistItems items={essentials} className="mt-4" /> : null}

        {orientation.length > 0 ? (
          <div className="mt-4">
            <ChecklistItems items={orientation} />
          </div>
        ) : null}

        {showDeepening ? <DeepeningSection items={deepening} defaultOpen /> : null}
      </section>

      <WelcomeModal
        open={status.showWelcome}
        onCreatePath="/accounts/new"
      />
    </>
  );
}

function WelcomeModal({ open, onCreatePath }: { open: boolean; onCreatePath: string }) {
  const router = useRouter();
  const [closed, setClosed] = useState(false);
  const visible = open && !closed;

  return (
    <Modal
      open={visible}
      title="Bem-vindo ao Orcadom"
      onClose={() => {
        setClosed(true);
      }}
    >
      <p className="text-sm text-ink-soft">
        Este é o espaço da casa para contas, lançamentos e o mês. Nada fica bloqueado — você pode
        explorar agora ou seguir o checklist no painel.
      </p>
      <p className="mt-3 text-sm text-ink-soft">Comece pela primeira conta financeira.</p>
      <div className="mt-5 flex justify-end">
        <Button
          offlineLock
          onClick={() => {
            setClosed(true);
            router.push(onCreatePath);
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
  defaultOpen,
}: {
  items: { id: string; title: string; href: string; completed?: boolean }[];
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
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

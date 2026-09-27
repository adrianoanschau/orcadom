'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@/lib/models';
import { useOnboardingStatus } from './onboarding-checklist';
import { Button } from './ui';

export function OnboardingSettings() {
  const queryClient = useQueryClient();
  const onboarding = useOnboardingStatus();
  const resume = useMutation({
    mutationFn: () => api<OnboardingStatus>('/onboarding/resume', { method: 'PATCH' }),
    onSuccess: (next) => {
      queryClient.setQueryData(['onboarding'], next);
    },
  });

  if (!onboarding.data?.dismissedAt) return null;

  return (
    <div className="rounded-lg bg-surface px-5 py-4">
      <p className="text-sm font-medium text-ink">Checklist inicial</p>
      <p className="mt-1 text-sm text-ink-soft">
        Você escondeu os primeiros passos do painel. Pode trazer o card de volta quando quiser.
      </p>
      <div className="mt-3">
        <Button
          variant="secondary"
          disabled={resume.isPending}
          onClick={() => {
            resume.mutate();
          }}
        >
          {resume.isPending ? 'Mostrando…' : 'Mostrar checklist de novo'}
        </Button>
      </div>
    </div>
  );
}

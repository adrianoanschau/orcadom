'use client';

import { useQuery, type QueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { OnboardingStatus } from '@/lib/models';

export const onboardingQueryKey = ['onboarding', 'status'] as const;

export function invalidateOnboarding(queryClient: QueryClient) {
  return queryClient.invalidateQueries({ queryKey: ['onboarding'] });
}

export function useOnboardingStatus() {
  return useQuery({
    queryKey: onboardingQueryKey,
    queryFn: () => api<OnboardingStatus>('/onboarding/status'),
  });
}

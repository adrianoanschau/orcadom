import type { ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { HouseholdProvider } from '@/components/household-provider';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <HouseholdProvider>
      <AppShell>{children}</AppShell>
    </HouseholdProvider>
  );
}

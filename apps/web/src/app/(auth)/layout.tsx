import type { ReactNode } from 'react';
import { AppVersion } from '@/components/app-version';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col px-4 py-10">
      <div className="flex flex-1 items-center justify-center">{children}</div>
      <footer className="flex justify-center pt-6">
        <AppVersion />
      </footer>
    </div>
  );
}

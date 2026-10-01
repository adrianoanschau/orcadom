export function AppVersion({ className }: { className?: string }) {
  const version = process.env.NEXT_PUBLIC_APP_VERSION;
  if (!version) return null;

  return <p className={`text-xs text-ink-faint ${className ?? ''}`.trim()}>v{version}</p>;
}

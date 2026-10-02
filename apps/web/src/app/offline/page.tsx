import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Você está offline',
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <section className="w-full max-w-md rounded-lg bg-surface p-6 text-center sm:p-8">
        <p className="font-display text-h2 font-medium text-brand">Orcadom</p>
        <h1 className="mt-4 font-display text-h1 font-semibold">Você está offline</h1>
        <p className="mt-3 text-sm text-ink-soft">
          Esta tela ainda não estava salva neste aparelho.
        </p>
        <form className="mt-6" method="get">
          <button
            type="submit"
            className="inline-flex min-h-11 items-center justify-center rounded-pill bg-brand px-4 text-sm font-medium text-white"
          >
            Tentar de novo
          </button>
        </form>
      </section>
    </div>
  );
}

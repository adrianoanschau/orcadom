'use client';

import { useOnlineStatus } from '@/hooks/use-online-status';
import { Button } from './ui';
import { usePwa } from './pwa-provider';

export function PwaBanners() {
  const pwa = usePwa();
  const offline = !useOnlineStatus();

  const showInstall =
    !pwa.installed && !pwa.installDismissed && (pwa.canPromptInstall || pwa.isIos);

  if (!offline && !showInstall) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(4.25rem+env(safe-area-inset-bottom))] lg:pb-6">
      <div className="mx-auto flex max-w-5xl flex-col gap-2">
        {offline ? (
          <p
            role="status"
            className="pointer-events-auto rounded-md border border-hairline bg-surface px-4 py-3 text-sm text-ink shadow-sm"
          >
            Você está offline — mostrando os últimos dados salvos
          </p>
        ) : null}
        {showInstall ? (
          <div className="pointer-events-auto flex flex-wrap items-center justify-between gap-3 rounded-md border border-hairline bg-surface px-4 py-3">
            <p className="text-sm text-ink">
              {pwa.isIos
                ? 'Adicione o Orcadom à Tela de Início pelo menu Compartilhar do Safari.'
                : 'Instale o Orcadom na tela inicial para abrir como app.'}
            </p>
            <div className="flex gap-2">
              {pwa.canPromptInstall ? (
                <Button variant="primary" onClick={() => void pwa.install()}>
                  Instalar
                </Button>
              ) : null}
              <Button variant="ghost" onClick={pwa.dismissInstall}>
                Agora não
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

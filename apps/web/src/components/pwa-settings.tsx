'use client';

import { useEffect } from 'react';
import { Button, Notice } from './ui';
import { usePwa } from './pwa-provider';

export function PwaSettings() {
  const pwa = usePwa();

  useEffect(() => {
    void pwa.refreshPushConfig();
  }, [pwa.refreshPushConfig]);

  return (
    <div className="space-y-4 rounded-lg bg-surface px-5 py-4">
      <div>
        <p className="text-sm font-medium text-ink">Aplicativo no celular</p>
        <p className="mt-1 text-sm text-ink-soft">
          Instale o Orcadom na tela inicial. O visual abre rápido; os dados financeiros continuam
          vindo da rede — de propósito, para o saldo não ficar desatualizado.
        </p>
        <div className="mt-3">
          {pwa.installed ? (
            <p className="text-sm text-ink">Orcadom já está instalado neste aparelho.</p>
          ) : pwa.canPromptInstall ? (
            <Button variant="secondary" onClick={() => void pwa.install()}>
              Instalar aplicativo
            </Button>
          ) : pwa.isIos ? (
            <p className="text-sm text-ink">
              No Safari, toque em Compartilhar e depois em &quot;Adicionar à Tela de Início&quot;.
            </p>
          ) : (
            <p className="text-sm text-ink-soft">
              Use o menu do navegador para instalar, se o atalho ainda não apareceu.
            </p>
          )}
        </div>
      </div>
      <div className="border-t border-hairline pt-4">
        <p className="text-sm font-medium text-ink">Notificações no aparelho</p>
        <p className="mt-1 text-sm text-ink-soft">
          Mesmos avisos que já saem por e-mail: orçamento estourado e extrato sem conta mapeada.
        </p>
        {!pwa.pushSupported ? (
          <p className="mt-3 text-sm text-ink-soft">Este navegador não oferece Web Push.</p>
        ) : (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pwa.pushEnabled ? (
              <Button
                variant="secondary"
                disabled={pwa.pushBusy}
                onClick={() => void pwa.disablePush()}
              >
                {pwa.pushBusy ? 'Desativando…' : 'Desativar push'}
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={pwa.pushBusy || !pwa.pushConfigured}
                onClick={() => void pwa.enablePush()}
              >
                {pwa.pushBusy ? 'Ativando…' : 'Ativar push'}
              </Button>
            )}
            {pwa.pushEnabled ? (
              <p className="text-sm text-ink">Push ativo neste aparelho.</p>
            ) : null}
          </div>
        )}
        {!pwa.pushConfigured && pwa.pushSupported ? (
          <p className="mt-3 text-sm text-ink-soft">
            As chaves VAPID ainda não foram configuradas neste ambiente.
          </p>
        ) : null}
        {pwa.pushError ? (
          <div className="mt-3">
            <Notice>{pwa.pushError}</Notice>
          </div>
        ) : null}
      </div>
    </div>
  );
}

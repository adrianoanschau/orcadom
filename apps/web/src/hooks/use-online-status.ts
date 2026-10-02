'use client';

import { useEffect, useState } from 'react';

export const OFFLINE_WRITE_HINT = 'Você está offline. Criar e editar volta quando a rede voltar.';

/** `true` quando o navegador reporta rede. Começa online para não divergir da hidratação. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    function sync() {
      setOnline(window.navigator.onLine);
    }
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
    };
  }, []);

  return online;
}

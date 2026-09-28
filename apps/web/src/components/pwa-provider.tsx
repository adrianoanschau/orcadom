'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api } from '@/lib/api';
import {
  INSTALL_DISMISS_KEY,
  isIosDevice,
  isStandaloneDisplay,
  urlBase64ToUint8Array,
} from '@/lib/pwa';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

interface PushPublicKey {
  publicKey: string | null;
}

interface PwaContextValue {
  installed: boolean;
  canPromptInstall: boolean;
  isIos: boolean;
  installDismissed: boolean;
  dismissInstall: () => void;
  install: () => Promise<void>;
  pushSupported: boolean;
  pushEnabled: boolean;
  pushConfigured: boolean;
  pushBusy: boolean;
  pushError: string | null;
  refreshPushConfig: () => Promise<void>;
  enablePush: () => Promise<void>;
  disablePush: () => Promise<void>;
}

const PwaContext = createContext<PwaContextValue | null>(null);

export function usePwa(): PwaContextValue {
  const value = useContext(PwaContext);
  if (!value) throw new Error('usePwa must be used within PwaProvider');
  return value;
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [installed, setInstalled] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installDismissed, setInstallDismissed] = useState(true);
  const [pushSupported, setPushSupported] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushConfigured, setPushConfigured] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  const refreshPushState = useCallback(async () => {
    if (
      !('serviceWorker' in navigator) ||
      !('PushManager' in window) ||
      !('Notification' in window)
    ) {
      setPushSupported(false);
      return;
    }
    setPushSupported(true);
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    setPushEnabled(Boolean(subscription) && window.Notification.permission === 'granted');
  }, []);

  const refreshPushConfig = useCallback(async () => {
    try {
      const key = await api<PushPublicKey>('/notifications/push/public-key');
      setPushConfigured(Boolean(key.publicKey));
    } catch {
      setPushConfigured(false);
    }
  }, []);

  useEffect(() => {
    setInstalled(isStandaloneDisplay());
    setIsIos(isIosDevice());
    setInstallDismissed(window.localStorage.getItem(INSTALL_DISMISS_KEY) === '1');

    function onDisplayChange(event: MediaQueryListEvent) {
      setInstalled(event.matches || isStandaloneDisplay());
    }
    const media = window.matchMedia('(display-mode: standalone)');
    media.addEventListener('change', onDisplayChange);

    function onInstallPrompt(event: Event) {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    }
    function onInstalled() {
      setInstalled(true);
      setInstallPrompt(null);
    }
    function onWorkerMessage(event: MessageEvent<{ type?: string; url?: string }>) {
      if (event.data.type === 'ORCADOM_NAVIGATE' && event.data.url) {
        window.location.assign(event.data.url);
      }
    }
    window.addEventListener('beforeinstallprompt', onInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    if ('serviceWorker' in navigator) {
      void navigator.serviceWorker.register('/sw.js', { scope: '/' });
      navigator.serviceWorker.addEventListener('message', onWorkerMessage);
    }

    void refreshPushState();

    return () => {
      media.removeEventListener('change', onDisplayChange);
      window.removeEventListener('beforeinstallprompt', onInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', onWorkerMessage);
      }
    };
  }, [refreshPushState]);

  const dismissInstall = useCallback(() => {
    window.localStorage.setItem(INSTALL_DISMISS_KEY, '1');
    setInstallDismissed(true);
  }, []);

  const install = useCallback(async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setInstalled(true);
      setInstallPrompt(null);
    }
  }, [installPrompt]);

  const enablePush = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const key = await api<PushPublicKey>('/notifications/push/public-key');
      if (!key.publicKey) {
        setPushConfigured(false);
        setPushError('As notificações no aparelho ainda não foram configuradas neste ambiente.');
        return;
      }
      const permission = await window.Notification.requestPermission();
      if (permission !== 'granted') {
        setPushError('Permissão de notificação recusada neste aparelho.');
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(key.publicKey),
      });
      const json = subscription.toJSON();
      if (!json.endpoint || !json.keys?.p256dh || !json.keys.auth) {
        throw new Error('Assinatura de push incompleta.');
      }
      await api('/notifications/push/subscriptions', {
        method: 'POST',
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
        }),
      });
      setPushEnabled(true);
      setPushConfigured(true);
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Não foi possível ativar o push.');
    } finally {
      setPushBusy(false);
    }
  }, []);

  const disablePush = useCallback(async () => {
    setPushBusy(true);
    setPushError(null);
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await api('/notifications/push/subscriptions', {
          method: 'DELETE',
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
    } catch (error) {
      setPushError(error instanceof Error ? error.message : 'Não foi possível desativar o push.');
    } finally {
      setPushBusy(false);
    }
  }, []);

  const value = useMemo<PwaContextValue>(
    () => ({
      installed,
      canPromptInstall: Boolean(installPrompt) && !installed,
      isIos,
      installDismissed,
      dismissInstall,
      install,
      pushSupported,
      pushEnabled,
      pushConfigured,
      pushBusy,
      pushError,
      refreshPushConfig,
      enablePush,
      disablePush,
    }),
    [
      installed,
      installPrompt,
      isIos,
      installDismissed,
      dismissInstall,
      install,
      pushSupported,
      pushEnabled,
      pushConfigured,
      pushBusy,
      pushError,
      refreshPushConfig,
      enablePush,
      disablePush,
    ],
  );

  return <PwaContext.Provider value={value}>{children}</PwaContext.Provider>;
}

export const TRUSTED_PROXIES = 'loopback, linklocal, uniquelocal';

interface TrustProxyApp {
  set(setting: 'trust proxy', value: string): void;
}

function isTrustProxyApp(app: unknown): app is TrustProxyApp {
  if (app === null || (typeof app !== 'object' && typeof app !== 'function')) return false;
  return 'set' in app && typeof app.set === 'function';
}

export function configureTrustProxy(app: unknown): void {
  if (!isTrustProxyApp(app)) {
    throw new Error('HTTP adapter does not support trust proxy');
  }
  app.set('trust proxy', TRUSTED_PROXIES);
}

export const INSTALL_DISMISS_KEY = 'orcadom.pwa.installDismissed';

export function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  const media = window.matchMedia('(display-mode: standalone)').matches;
  const iosStandalone =
    'standalone' in window.navigator &&
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
  return media || iosStandalone;
}

export function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const ua = window.navigator.userAgent;
  const iphone = ua.includes('iPad') || ua.includes('iPhone') || ua.includes('iPod');
  const ipadOs = ua.includes('Macintosh') && window.navigator.maxTouchPoints > 1;
  return iphone || ipadOs;
}

export function urlBase64ToUint8Array(base64: string): BufferSource {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(`${base64}${padding}`.replaceAll('-', '+').replaceAll('_', '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

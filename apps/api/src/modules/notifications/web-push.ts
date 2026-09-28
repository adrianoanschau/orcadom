import webpush from 'web-push';

export function configureWebPush(publicKey: string, privateKey: string, subject: string): void {
  webpush.setVapidDetails(subject, publicKey, privateKey);
}

export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
): Promise<{ ok: boolean; gone: boolean; detail?: string }> {
  try {
    await webpush.sendNotification(subscription, payload);
    return { ok: true, gone: false };
  } catch (error) {
    const status =
      error && typeof error === 'object' && 'statusCode' in error ? Number(error.statusCode) : 0;
    const detail = error instanceof Error ? error.message : 'falha desconhecida';
    return { ok: false, gone: status === 404 || status === 410, detail };
  }
}

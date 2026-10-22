import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export function readEncryptionKey(value: string | undefined): Buffer {
  const trimmed = value?.trim() ?? '';
  if (!trimmed) {
    throw new Error(
      'OPEN_FINANCE_MEUPLUGGY_ENABLED=true requires CREDENTIALS_ENCRYPTION_KEY (32 bytes, base64 or 64 hex characters)',
    );
  }
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) return Buffer.from(trimmed, 'hex');
  const decoded = Buffer.from(trimmed, 'base64');
  if (decoded.length === 32) return decoded;
  throw new Error('CREDENTIALS_ENCRYPTION_KEY is invalid: expected 32 bytes, base64 or 64 hex characters');
}

export function encryptSecret(plain: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${ciphertext.toString('base64')}`;
}

export function decryptSecret(payload: string, key: Buffer): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('credential payload is invalid');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataPart, 'base64')), decipher.final()]).toString('utf8');
}

export function hashWebhookToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function secretsMatch(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}

export function meuPluggyEnabled(env: { OPEN_FINANCE_MEUPLUGGY_ENABLED?: string }): boolean {
  return env.OPEN_FINANCE_MEUPLUGGY_ENABLED === 'true';
}

export const CONNECTING_IP_HEADER = 'x-orcadom-connecting-ip';

const MAPPED_IPV4 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

export function normalizePeerIp(value: string): string {
  const trimmed = value.trim();
  return MAPPED_IPV4.exec(trimmed)?.[1] ?? trimmed;
}

export function appendForwardedFor(
  existing: string | null | undefined,
  peer: string | null | undefined,
): string | null {
  const chain = (existing ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
  if (peer) {
    const normalized = normalizePeerIp(peer);
    if (normalized && chain.at(-1) !== normalized) chain.push(normalized);
  }
  return chain.length > 0 ? chain.join(', ') : null;
}

interface HeaderSource {
  get(name: string): string | null;
}

export function proxyUpstreamHeaders(input: { headers: HeaderSource; protocol: string }): Headers {
  const headers = new Headers();
  const userAgent = input.headers.get('user-agent');
  if (userAgent) headers.set('user-agent', userAgent);

  const proto = input.headers.get('x-forwarded-proto') ?? input.protocol.replace(/:$/, '');
  if (proto) headers.set('x-forwarded-proto', proto);

  const host = input.headers.get('x-forwarded-host') ?? input.headers.get('host');
  if (host) headers.set('x-forwarded-host', host);

  const forwarded = appendForwardedFor(
    input.headers.get('x-forwarded-for'),
    input.headers.get(CONNECTING_IP_HEADER),
  );
  if (forwarded) headers.set('x-forwarded-for', forwarded);

  return headers;
}

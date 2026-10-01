import { describe, expect, it } from 'vitest';
import { stampConnectingIp } from './connecting-ip';
import { CONNECTING_IP_HEADER, appendForwardedFor, proxyUpstreamHeaders } from './forward-headers';

function headersOf(values: Record<string, string>): { get(name: string): string | null } {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

describe('appendForwardedFor', () => {
  it('preserva a cadeia do Caddy e acrescenta o peer uma vez', () => {
    expect(appendForwardedFor('203.0.113.10', '10.0.0.2')).toBe('203.0.113.10, 10.0.0.2');
    expect(appendForwardedFor('203.0.113.10, 10.0.0.2', '10.0.0.2')).toBe('203.0.113.10, 10.0.0.2');
  });

  it('normaliza IPv4 mapeado em IPv6', () => {
    expect(appendForwardedFor('203.0.113.10', '::ffff:10.0.0.2')).toBe('203.0.113.10, 10.0.0.2');
  });
});

describe('proxyUpstreamHeaders', () => {
  it('copia user-agent, proto, host e a cadeia com o peer', () => {
    const headers = proxyUpstreamHeaders({
      protocol: 'http:',
      headers: headersOf({
        'user-agent': 'OrcadomBrowser',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'orcadom.app',
        'x-forwarded-for': '203.0.113.10',
        [CONNECTING_IP_HEADER]: '172.18.0.4',
        cookie: 'accessToken=secret',
      }),
    });

    expect(headers.get('user-agent')).toBe('OrcadomBrowser');
    expect(headers.get('x-forwarded-proto')).toBe('https');
    expect(headers.get('x-forwarded-host')).toBe('orcadom.app');
    expect(headers.get('x-forwarded-for')).toBe('203.0.113.10, 172.18.0.4');
    expect(headers.get(CONNECTING_IP_HEADER)).toBeNull();
    expect(headers.get('cookie')).toBeNull();
  });

  it('usa o protocolo e o host do request quando o proxy ainda não os enviou', () => {
    const headers = proxyUpstreamHeaders({
      protocol: 'http:',
      headers: headersOf({ host: 'localhost:3000' }),
    });

    expect(headers.get('x-forwarded-proto')).toBe('http');
    expect(headers.get('x-forwarded-host')).toBe('localhost:3000');
    expect(headers.get('x-forwarded-for')).toBeNull();
  });
});

describe('stampConnectingIp', () => {
  it('sobrescreve um IP de conexão enviado pelo cliente', () => {
    const req = {
      headers: { [CONNECTING_IP_HEADER]: '1.2.3.4' },
      socket: { remoteAddress: '::ffff:203.0.113.9' },
    };

    stampConnectingIp(req);

    expect(req.headers[CONNECTING_IP_HEADER]).toBe('203.0.113.9');
  });

  it('remove o header interno quando o socket não tem endereço', () => {
    const req = {
      headers: { [CONNECTING_IP_HEADER]: '1.2.3.4' },
      socket: {},
    };

    stampConnectingIp(req);

    expect(req.headers[CONNECTING_IP_HEADER]).toBeUndefined();
  });
});

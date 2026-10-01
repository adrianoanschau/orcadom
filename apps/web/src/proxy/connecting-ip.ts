import { Server, type IncomingMessage } from 'node:http';
import { CONNECTING_IP_HEADER, normalizePeerIp } from './forward-headers';

const patchedServers = new WeakSet();

interface StampableRequest {
  headers: IncomingMessage['headers'];
  socket?: { remoteAddress?: string | null };
}

export function stampConnectingIp(req: StampableRequest | undefined): void {
  if (!req) return;
  const peer = req.socket?.remoteAddress;
  if (typeof peer === 'string' && peer.length > 0) {
    req.headers[CONNECTING_IP_HEADER] = normalizePeerIp(peer);
    return;
  }
  delete req.headers['x-orcadom-connecting-ip'];
}

export function attachConnectingIp(): void {
  if (patchedServers.has(Server.prototype)) return;

  // The wrapper has to keep the original method; calling the prototype after
  // replacement would recurse.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalEmit: Server['emit'] = Server.prototype.emit;
  Server.prototype.emit = function (
    this: Server,
    event: string | symbol,
    ...args: unknown[]
  ): boolean {
    if (event === 'request' && isStampableRequest(args[0])) stampConnectingIp(args[0]);
    return originalEmit.apply(this, [event, ...args] as Parameters<Server['emit']>);
  };
  patchedServers.add(Server.prototype);
}

function isStampableRequest(value: unknown): value is StampableRequest {
  if (typeof value !== 'object' || value === null) return false;
  return 'headers' in value && 'socket' in value;
}

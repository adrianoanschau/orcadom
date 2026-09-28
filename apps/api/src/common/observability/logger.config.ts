import { getActor, SENSITIVE_FIELDS } from '@orcadom/database';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { resolveRequestId } from './request-id.js';

const AUTH_BODY_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

type LoggedRequest = IncomingMessage & {
  id?: string;
  user?: { userId?: string };
  household?: { id?: string };
  raw?: IncomingMessage;
};

export function logLevel(): string {
  if (process.env.LOG_LEVEL) return process.env.LOG_LEVEL;
  return process.env.NODE_ENV === 'production' ? 'info' : 'debug';
}

export function logRedactPaths(): string[] {
  const fields = [...SENSITIVE_FIELDS, 'password', 'refreshToken'];
  return [
    'req.headers.authorization',
    'req.headers.cookie',
    'req.headers["x-orcadom-api-key"]',
    ...fields.flatMap((field) => [`req.body.${field}`, field]),
  ];
}

export function actorLogBindings() {
  const actor = getActor();
  return {
    requestId: actor.requestId,
    userId: actor.userId,
    householdId: actor.householdId,
    source: actor.source,
  };
}

function requestUrl(req: IncomingMessage): string {
  return req.url ?? '';
}

function isAuthBodyPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return AUTH_BODY_PATHS.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function isMetricsPath(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  return path === '/metrics';
}

export function buildPinoHttpOptions() {
  return {
    level: logLevel(),
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const id = resolveRequestId(req.headers['x-request-id'], randomUUID());
      res.setHeader('x-request-id', id);
      return id;
    },
    redact: {
      paths: logRedactPaths(),
      censor: '[Redacted]',
    },
    autoLogging: {
      ignore: (req: IncomingMessage) => isMetricsPath(requestUrl(req)),
    },
    customProps: (req: LoggedRequest) => {
      const actor = actorLogBindings();
      return {
        requestId: actor.requestId ?? req.id,
        userId: req.user?.userId ?? actor.userId,
        householdId: req.household?.id ?? actor.householdId,
        source: actor.source,
      };
    },
    serializers: {
      req(req: LoggedRequest) {
        const raw = req.raw ?? req;
        const url = requestUrl(raw);
        return {
          id: req.id,
          method: req.method,
          url,
          body: isAuthBodyPath(url) ? '[redacted]' : undefined,
        };
      },
    },
    mixin: actorLogBindings,
  };
}

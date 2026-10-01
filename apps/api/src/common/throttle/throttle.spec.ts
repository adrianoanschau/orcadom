import 'reflect-metadata';
import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  type INestApplication,
  Module,
  Post,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { SkipThrottle, Throttle, ThrottlerModule } from '@nestjs/throttler';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppThrottlerGuard } from '../guards/app-throttler.guard.js';
import { configureTrustProxy } from '../trust-proxy.js';
import { THROTTLE_ERROR_MESSAGE } from './throttle.constants.js';

@Controller()
class ProbeController {
  @Throttle({ default: { limit: 2, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  @Post('login')
  login() {
    return { ok: true };
  }

  @SkipThrottle()
  @Get('metrics')
  metrics() {
    return 'ok';
  }

  @Get('open')
  open() {
    return { ok: true };
  }
}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    }),
  ],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module
class ProbeModule {}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      skipIf: () => true,
      throttlers: [{ name: 'default', ttl: 60_000, limit: 1 }],
    }),
  ],
  controllers: [ProbeController],
  providers: [{ provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
// eslint-disable-next-line @typescript-eslint/no-extraneous-class -- Nest module
class DisabledProbeModule {}

async function listen(app: INestApplication): Promise<{ baseUrl: string; server: Server }> {
  await app.init();
  const server = app.getHttpServer() as Server;
  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve();
    });
  });
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server');
  }
  return { baseUrl: `http://127.0.0.1:${String(address.port)}`, server };
}

interface ExpressApp {
  request: object;
}

function clientIp(expressApp: ExpressApp, remoteAddress: string, forwardedFor?: string): string {
  const req = Object.create(expressApp.request) as {
    headers: Record<string, string>;
    socket: { remoteAddress: string };
    readonly ip: string;
  };
  req.headers = forwardedFor ? { 'x-forwarded-for': forwardedFor } : {};
  req.socket = { remoteAddress };
  return req.ip;
}

describe('AppThrottlerGuard', () => {
  it('lança 429 no formato padronizado', async () => {
    const guard = Object.create(AppThrottlerGuard.prototype) as AppThrottlerGuard;
    await expect(
      (
        guard as unknown as {
          throwThrottlingException: (ctx: unknown, detail: unknown) => Promise<void>;
        }
      ).throwThrottlingException({}, {}),
    ).rejects.toMatchObject({
      response: {
        statusCode: 429,
        message: THROTTLE_ERROR_MESSAGE,
        error: 'Too Many Requests',
      },
      status: 429,
    });
  });
});

describe('rate limiting HTTP', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    configureTrustProxy(app.getHttpAdapter().getInstance() as unknown);
    ({ baseUrl } = await listen(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('bloqueia o login após exceder o limite com corpo 429 padronizado', async () => {
    const first = await fetch(`${baseUrl}/login`, { method: 'POST' });
    const second = await fetch(`${baseUrl}/login`, { method: 'POST' });
    const third = await fetch(`${baseUrl}/login`, { method: 'POST' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    await expect(third.json()).resolves.toEqual({
      statusCode: 429,
      message: THROTTLE_ERROR_MESSAGE,
      error: 'Too Many Requests',
    });
  });

  it('não compartilha o limite de login entre IPs diferentes atrás do proxy', async () => {
    const from = (ip: string) =>
      fetch(`${baseUrl}/login`, {
        method: 'POST',
        headers: { 'x-forwarded-for': ip },
      });

    expect((await from('203.0.113.10')).status).toBe(200);
    expect((await from('203.0.113.10')).status).toBe(200);
    expect((await from('203.0.113.10')).status).toBe(429);
    expect((await from('203.0.113.11')).status).toBe(200);
  });

  it('ignora x-forwarded-for forjado vindo de fora da rede confiável', () => {
    const expressApp = app.getHttpAdapter().getInstance() as ExpressApp;
    expect(clientIp(expressApp, '198.51.100.8', '203.0.113.10')).toBe('198.51.100.8');
    expect(clientIp(expressApp, '10.0.0.5', '203.0.113.10, 10.0.0.2')).toBe('203.0.113.10');
  });

  it('não aplica throttle em rotas com @SkipThrottle', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 5 }, () => fetch(`${baseUrl}/metrics`).then((r) => r.status)),
    );
    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});

describe('rate limiting disabled', () => {
  let app: INestApplication;
  let baseUrl: string;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [DisabledProbeModule] }).compile();
    app = moduleRef.createNestApplication();
    ({ baseUrl } = await listen(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('não bloqueia quando skipIf desliga o throttler', async () => {
    const statuses = await Promise.all(
      Array.from({ length: 5 }, () =>
        fetch(`${baseUrl}/login`, { method: 'POST' }).then((r) => r.status),
      ),
    );
    expect(statuses.every((status) => status === 200)).toBe(true);
  });
});

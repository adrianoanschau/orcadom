import { describe, expect, it } from 'vitest';
import { getActor, runWithActor, SENSITIVE_FIELDS } from '@orcadom/database';
import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import { ActorContextInterceptor } from '../interceptors/actor-context.interceptor.js';
import { HttpMetricsInterceptor } from '../interceptors/http-metrics.interceptor.js';
import { actorLogBindings, logRedactPaths } from './logger.config.js';
import { isMetricsRoute, metricsRegistry, recordAutomationIngest } from './metrics.js';
import { resolveRequestId } from './request-id.js';
import { runObservedJob } from './run-observed-job.js';

function httpContext(request: object, response: object): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as ExecutionContext;
}

function handler<T>(value: T): CallHandler<T> {
  return { handle: () => of(value) };
}

describe('resolveRequestId', () => {
  it('aceita um id válido e rejeita lixo', () => {
    expect(resolveRequestId('req-abc.1', 'fallback')).toBe('req-abc.1');
    expect(resolveRequestId(['from-header'], 'fallback')).toBe('from-header');
    expect(resolveRequestId('has space', 'fallback')).toBe('fallback');
    expect(resolveRequestId('', 'fallback')).toBe('fallback');
  });
});

describe('ActorContextInterceptor', () => {
  it('reusa x-request-id e popula o contexto de ator', async () => {
    const headers: Record<string, string> = {};
    const request = {
      headers: { 'x-request-id': 'fixed-id' },
      user: { userId: 'user-1' },
      household: { id: 'house-1' },
    };
    const response = {
      setHeader: (name: string, value: string) => {
        headers[name] = value;
      },
    };
    const interceptor = new ActorContextInterceptor();
    let actorInside = getActor();

    const captured = await lastValueFrom(
      interceptor.intercept(httpContext(request, response), {
        handle: () => {
          actorInside = getActor();
          return of('ok');
        },
      }),
    );

    expect(captured).toBe('ok');
    expect(headers['x-request-id']).toBe('fixed-id');
    expect(request).toMatchObject({ id: 'fixed-id' });
    expect(actorInside).toMatchObject({
      requestId: 'fixed-id',
      userId: 'user-1',
      householdId: 'house-1',
      source: 'USER',
    });
  });
});

describe('log redact', () => {
  it('compartilha SENSITIVE_FIELDS com a auditoria', () => {
    const paths = logRedactPaths();
    for (const field of SENSITIVE_FIELDS) {
      expect(paths).toContain(`req.body.${field}`);
    }
    expect(paths).toContain('req.headers["x-orcadom-api-key"]');
    expect(paths).toContain('req.body.password');
  });
});

describe('actorLogBindings', () => {
  it('lê o requestId do contexto de ator', () => {
    runWithActor({ userId: 'u1', householdId: 'h1', source: 'USER', requestId: 'rid-9' }, () => {
      expect(actorLogBindings()).toEqual({
        requestId: 'rid-9',
        userId: 'u1',
        householdId: 'h1',
        source: 'USER',
      });
    });
    expect(getActor().requestId).toBeNull();
  });
});

describe('runObservedJob', () => {
  it('marca sucesso e falha nas métricas', async () => {
    const job = `test_job_${String(Date.now())}`;
    await runObservedJob(job, 'SYSTEM', () => Promise.resolve(1));
    await expect(
      runObservedJob(job, 'SYSTEM', () => Promise.reject(new Error('boom'))),
    ).rejects.toThrow('boom');

    const body = await metricsRegistry.metrics();
    expect(body).toMatch(new RegExp(`cron_job_runs_total\\{job="${job}",result="success"\\} 1`));
    expect(body).toMatch(new RegExp(`cron_job_runs_total\\{job="${job}",result="failure"\\} 1`));
  });
});

describe('metrics', () => {
  it('incrementa ingestão de automação e ignora /metrics', async () => {
    recordAutomationIngest('PROCESSED');
    const body = await metricsRegistry.metrics();
    expect(body).toMatch(/automation_ingest_total\{status="PROCESSED"\} /);
    expect(isMetricsRoute('/metrics')).toBe(true);
    expect(isMetricsRoute('/metrics?foo=1')).toBe(true);
    expect(isMetricsRoute('/automation/email-imports')).toBe(false);
  });

  it('observa requisições HTTP e pula /metrics', async () => {
    const interceptor = new HttpMetricsInterceptor();
    await lastValueFrom(
      interceptor.intercept(
        httpContext(
          {
            method: 'POST',
            url: '/automation/email-imports',
            route: { path: '/automation/email-imports' },
          },
          { statusCode: 201 },
        ),
        handler({ ok: true }),
      ),
    );

    await lastValueFrom(
      interceptor.intercept(
        httpContext(
          { method: 'GET', url: '/metrics', route: { path: '/metrics' } },
          { statusCode: 200 },
        ),
        handler('ok'),
      ),
    );

    await lastValueFrom(
      interceptor.intercept(
        httpContext({ method: 'GET', url: '/fail', route: { path: '/fail' } }, { statusCode: 500 }),
        { handle: () => throwError(() => Object.assign(new Error('nope'), { status: 503 })) },
      ),
    ).catch(() => undefined);

    const body = await metricsRegistry.metrics();
    expect(body).toMatch(
      /http_requests_total\{method="POST",route="\/automation\/email-imports",status="201"\} /,
    );
    expect(body).not.toMatch(/route="\/metrics"/);
    expect(body).toMatch(/http_requests_total\{method="GET",route="\/fail",status="503"\} /);
  });
});

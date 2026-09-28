import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';

export const metricsRegistry = new Registry();

if (!process.env.VITEST) {
  collectDefaultMetrics({ register: metricsRegistry });
}

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total de requisições HTTP',
  labelNames: ['method', 'route', 'status'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duração das requisições HTTP em segundos',
  labelNames: ['method', 'route'] as const,
  registers: [metricsRegistry],
});

export const cronJobRunsTotal = new Counter({
  name: 'cron_job_runs_total',
  help: 'Execuções de jobs agendados por resultado',
  labelNames: ['job', 'result'] as const,
  registers: [metricsRegistry],
});

export const cronJobDuration = new Histogram({
  name: 'cron_job_duration_seconds',
  help: 'Duração das execuções de jobs agendados em segundos',
  labelNames: ['job'] as const,
  registers: [metricsRegistry],
});

export const automationIngestTotal = new Counter({
  name: 'automation_ingest_total',
  help: 'Ingestão de importação por email por status de domínio',
  labelNames: ['status'] as const,
  registers: [metricsRegistry],
});

export function recordAutomationIngest(status: string): void {
  automationIngestTotal.inc({ status });
}

export function observeHttpRequest(
  method: string,
  route: string,
  status: number,
  durationSeconds: number,
): void {
  httpRequestsTotal.inc({ method, route, status: String(status) });
  httpRequestDuration.observe({ method, route }, durationSeconds);
}

export function isMetricsRoute(path: string): boolean {
  const route = path.split('?')[0] ?? path;
  return route === '/metrics';
}

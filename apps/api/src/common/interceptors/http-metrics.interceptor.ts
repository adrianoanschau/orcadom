import {
  HttpException,
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { finalize, tap } from 'rxjs/operators';
import { isMetricsRoute, observeHttpRequest } from '../observability/metrics.js';

@Injectable()
export class HttpMetricsInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const http = context.switchToHttp();
    const request = http.getRequest<{ method?: string; url?: string; route?: { path?: string } }>();
    const response = http.getResponse<{ statusCode?: number }>();
    const method = request.method ?? 'GET';
    const route = request.route?.path ?? normalizeRoute(request.url);
    if (isMetricsRoute(route) || isMetricsRoute(request.url ?? '')) {
      return next.handle();
    }

    const started = process.hrtime.bigint();
    let recorded = false;

    const record = (status: number) => {
      if (recorded) return;
      recorded = true;
      const durationSeconds = Number(process.hrtime.bigint() - started) / 1e9;
      observeHttpRequest(method, route, status, durationSeconds);
    };

    return next.handle().pipe(
      tap({
        error: (error: unknown) => {
          record(statusFromError(error, 500));
        },
      }),
      finalize(() => {
        record(response.statusCode ?? 200);
      }),
    );
  }
}

function normalizeRoute(url: string | undefined): string {
  if (!url) return 'unknown';
  const path = url.split('?')[0] ?? url;
  return path.length > 0 ? path : 'unknown';
}

function statusFromError(error: unknown, fallback: number): number {
  if (error instanceof HttpException) return error.getStatus();
  if (typeof error === 'object' && error && 'status' in error && typeof error.status === 'number') {
    return error.status;
  }
  return fallback;
}

import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { SentryGlobalFilter, SentryModule } from '@sentry/nestjs/setup';
import { LoggerModule } from 'nestjs-pino';
import { HttpMetricsInterceptor } from '../interceptors/http-metrics.interceptor.js';
import { buildPinoHttpOptions } from './logger.config.js';

@Global()
@Module({
  imports: [LoggerModule.forRoot({ pinoHttp: buildPinoHttpOptions() }), SentryModule.forRoot()],
  providers: [
    { provide: APP_INTERCEPTOR, useClass: HttpMetricsInterceptor },
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class ObservabilityModule {}

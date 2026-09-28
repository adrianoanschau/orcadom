import { Controller, Get, Header } from '@nestjs/common';
import { ApiOkResponse, ApiProduces, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';
import { metricsRegistry } from './common/observability/metrics.js';

interface ApiInfo {
  name: string;
  status: 'ok';
  docs: string;
}

const info: ApiInfo = {
  name: 'Orcadom API',
  status: 'ok',
  docs: '/api/docs',
};

@ApiTags('app')
@Public()
@Controller()
export class AppController {
  @Get()
  @ApiOkResponse({ description: 'Informações da API' })
  root(): ApiInfo {
    return info;
  }

  @Get('api')
  @ApiOkResponse({ description: 'Informações da API' })
  api(): ApiInfo {
    return info;
  }

  @Get('metrics')
  @Header('Content-Type', metricsRegistry.contentType)
  @ApiProduces(metricsRegistry.contentType)
  @ApiOkResponse({ description: 'Métricas Prometheus' })
  metrics(): Promise<string> {
    return metricsRegistry.metrics();
  }
}

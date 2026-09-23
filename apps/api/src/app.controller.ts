import { Controller, Get } from '@nestjs/common';
import { ApiOkResponse, ApiTags } from '@nestjs/swagger';
import { Public } from './common/decorators/public.decorator.js';

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
}

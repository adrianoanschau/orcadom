import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { AutomationApiKeyGuard } from '../../common/guards/automation-api-key.guard.js';
import { EmailImportBody, EmailImportLogsQuery } from './automation.dto.js';
import { AutomationService } from './automation.service.js';

@ApiTags('automation')
@ApiHeader({ name: 'x-orcadom-api-key', required: true })
@Public()
@UseGuards(AutomationApiKeyGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Post('email-imports')
  ingest(@Body() body: EmailImportBody) {
    return this.automation.ingestEmail(body);
  }

  @Get('email-import-logs')
  logs(@Query() query: EmailImportLogsQuery) {
    return this.automation.listLogs(query);
  }
}

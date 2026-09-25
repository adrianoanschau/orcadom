import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { ListAuditLogsQueryDto } from './audit-logs.dto.js';
import { AuditLogsService } from './audit-logs.service.js';

@ApiTags('audit-logs')
@ApiCookieAuth('accessToken')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(private readonly auditLogs: AuditLogsService) {}

  @Get()
  list(@CurrentHousehold() householdId: string, @Query() query: ListAuditLogsQueryDto) {
    return this.auditLogs.list(householdId, query);
  }
}

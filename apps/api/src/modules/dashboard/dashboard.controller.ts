import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { DashboardQueryDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiCookieAuth('accessToken')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentHousehold() householdId: string, @Query() query: DashboardQueryDto) {
    return this.dashboard.summary(householdId, query.month);
  }
}

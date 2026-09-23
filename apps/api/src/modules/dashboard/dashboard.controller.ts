import { Controller, Get, Query } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { DashboardQueryDto } from './dashboard.dto.js';
import { DashboardService } from './dashboard.service.js';

@ApiTags('dashboard')
@ApiCookieAuth('accessToken')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('summary')
  summary(@CurrentUser() userId: string, @Query() query: DashboardQueryDto) {
    return this.dashboard.summary(userId, query.month);
  }
}

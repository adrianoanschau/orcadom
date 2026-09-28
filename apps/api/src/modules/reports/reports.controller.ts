import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CreateReportBody, ReportParams } from './reports.dto.js';
import { ReportsService } from './reports.service.js';

@ApiTags('reports')
@ApiCookieAuth('accessToken')
@Controller('reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Post()
  async create(
    @CurrentHousehold() householdId: string,
    @CurrentUser() userId: string,
    @Body() body: CreateReportBody,
    @Res({ passthrough: true }) response: Response,
  ) {
    const created = await this.reports.create(householdId, userId, body);
    if (created.status === 'PENDING' || created.status === 'PROCESSING') {
      response.status(HttpStatus.ACCEPTED);
    }
    return created;
  }

  @Get()
  list(@CurrentHousehold() householdId: string, @CurrentUser() userId: string) {
    return this.reports.list(householdId, userId);
  }

  @Get(':id/download')
  async download(
    @CurrentHousehold() householdId: string,
    @CurrentUser() userId: string,
    @Param() params: ReportParams,
  ) {
    const file = await this.reports.download(householdId, userId, params.id);
    return new StreamableFile(file.stream, {
      type: file.contentType,
      disposition: `attachment; filename="${file.fileName}"`,
    });
  }

  @Get(':id')
  get(
    @CurrentHousehold() householdId: string,
    @CurrentUser() userId: string,
    @Param() params: ReportParams,
  ) {
    return this.reports.get(householdId, userId, params.id);
  }
}

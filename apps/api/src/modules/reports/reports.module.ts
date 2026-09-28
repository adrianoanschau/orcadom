import { Module } from '@nestjs/common';
import { ReportEventsService } from './report-events.service.js';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportEventsService],
})
export class ReportsModule {}

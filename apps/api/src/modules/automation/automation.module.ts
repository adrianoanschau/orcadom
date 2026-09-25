import { Module } from '@nestjs/common';
import { ImportsModule } from '../imports/imports.module.js';
import { AutomationController } from './automation.controller.js';
import { AutomationService } from './automation.service.js';

@Module({
  imports: [ImportsModule],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}

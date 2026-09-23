import { Module } from '@nestjs/common';
import { ImportsModule } from '../imports/imports.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AutomationController } from './automation.controller.js';
import { AutomationService } from './automation.service.js';

@Module({
  imports: [ImportsModule, NotificationsModule],
  controllers: [AutomationController],
  providers: [AutomationService],
})
export class AutomationModule {}

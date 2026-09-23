import { Controller, Get, HttpCode, HttpStatus, Param, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { idParamSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

class NotificationParams extends createZodDto(idParamSchema) {}

@ApiTags('notifications')
@ApiCookieAuth('accessToken')
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() userId: string) {
    return this.notifications.listUnread(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() userId: string, @Param() params: NotificationParams) {
    return this.notifications.markRead(userId, params.id);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SkipHousehold } from '../../common/decorators/skip-household.decorator.js';
import {
  DeletePushSubscriptionBody,
  ListNotificationsQueryDto,
  NotificationParams,
  PushSubscriptionBody,
} from './notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

@ApiTags('notifications')
@ApiCookieAuth('accessToken')
@SkipHousehold()
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@CurrentUser() userId: string, @Query() query: ListNotificationsQueryDto) {
    return this.notifications.list(userId, query);
  }

  @Get('push/public-key')
  pushPublicKey() {
    return this.notifications.pushPublicKey();
  }

  @Post('push/subscriptions')
  @HttpCode(HttpStatus.CREATED)
  subscribePush(@CurrentUser() userId: string, @Body() body: PushSubscriptionBody) {
    return this.notifications.subscribePush(userId, body);
  }

  @Delete('push/subscriptions')
  @HttpCode(HttpStatus.NO_CONTENT)
  unsubscribePush(@CurrentUser() userId: string, @Body() body: DeletePushSubscriptionBody) {
    return this.notifications.unsubscribePush(userId, body.endpoint);
  }

  @Patch('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  markAllRead(@CurrentUser() userId: string): Promise<void> {
    return this.notifications.markAllRead(userId);
  }

  @Patch(':id/read')
  @HttpCode(HttpStatus.OK)
  markRead(@CurrentUser() userId: string, @Param() params: NotificationParams) {
    return this.notifications.markRead(userId, params.id);
  }
}

import {
  deletePushSubscriptionSchema,
  idParamSchema,
  listNotificationsQuerySchema,
  pushSubscriptionSchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}
export class NotificationParams extends createZodDto(idParamSchema) {}
export class PushSubscriptionBody extends createZodDto(pushSubscriptionSchema) {}
export class DeletePushSubscriptionBody extends createZodDto(deletePushSubscriptionSchema) {}

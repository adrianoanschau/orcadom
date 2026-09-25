import { idParamSchema, listNotificationsQuerySchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class ListNotificationsQueryDto extends createZodDto(listNotificationsQuerySchema) {}
export class NotificationParams extends createZodDto(idParamSchema) {}

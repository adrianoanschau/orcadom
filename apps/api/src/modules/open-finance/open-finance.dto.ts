import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const connectionBodySchema = z.object({
  externalId: z.string().min(1),
});

const connectionParamsSchema = z.object({
  id: z.uuid(),
});

const syncBodySchema = z.object({
  accounts: z
    .array(
      z.object({
        externalId: z.string().min(1),
        accountId: z.uuid().optional(),
      }),
    )
    .optional(),
});

const webhookParamsSchema = z.object({
  provider: z.string().min(1),
});

export class RegisterConnectionBody extends createZodDto(connectionBodySchema) {}
export class ConnectionParams extends createZodDto(connectionParamsSchema) {}
export class SyncConnectionBody extends createZodDto(syncBodySchema) {}
export class WebhookParams extends createZodDto(webhookParamsSchema) {}

import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

const credentialsSchema = z.object({
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  itemIds: z.array(z.string().min(1)).min(1).max(5),
});

const syncSchema = z.object({
  accounts: z
    .array(
      z.object({
        externalId: z.string().min(1),
        accountId: z.uuid(),
      }),
    )
    .optional(),
});

const webhookParamsSchema = z.object({
  userToken: z.string().min(1),
});

export class SaveMeuPluggyCredentialsBody extends createZodDto(credentialsSchema) {}
export class SyncMeuPluggyBody extends createZodDto(syncSchema) {}
export class MeuPluggyWebhookParams extends createZodDto(webhookParamsSchema) {}

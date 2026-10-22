import { z } from 'zod';

export const connectionStatusSchema = z.enum([
  'ACTIVE',
  'UPDATING',
  'LOGIN_ERROR',
  'EXPIRED',
  'REVOKED',
]);

export const providerConnectionSchema = z.object({
  id: z.string().min(1),
  status: connectionStatusSchema,
  institutionName: z.string().min(1),
  lastSyncAt: z.date().nullable(),
});

export const accountKindSchema = z.enum(['CHECKING', 'SAVINGS', 'CREDIT_CARD']);

export const providerAccountSchema = z.object({
  externalId: z.string().min(1),
  kind: accountKindSchema,
  name: z.string().min(1),
  number: z.string().min(1),
  currency: z.string().length(3),
  balanceCents: z.number().int(),
  creditLimitCents: z.number().int().optional(),
});

export const installmentSchema = z.object({
  number: z.number().int().positive(),
  total: z.number().int().positive(),
});

export const providerTransactionSchema = z.object({
  externalId: z.string().min(1),
  accountExternalId: z.string().min(1),
  date: z.date(),
  amountCents: z.number().int(),
  description: z.string().min(1),
  rawCategory: z.string().optional(),
  billExternalId: z.string().optional(),
  installment: installmentSchema.optional(),
});

export const webhookEventTypeSchema = z.enum([
  'CONNECTION_UPDATED',
  'TRANSACTIONS_AVAILABLE',
  'CONNECTION_ERROR',
]);

export const webhookEventSchema = z.object({
  type: webhookEventTypeSchema,
  connectionId: z.string().min(1),
  payload: z.unknown(),
});

export const connectTokenSchema = z.object({
  token: z.string().min(1),
  expiresAt: z.date(),
});

export type ProviderConnection = z.infer<typeof providerConnectionSchema>;
export type ProviderAccount = z.infer<typeof providerAccountSchema>;
export type ProviderTransaction = z.infer<typeof providerTransactionSchema>;
export type WebhookEvent = z.infer<typeof webhookEventSchema>;
export type ConnectToken = z.infer<typeof connectTokenSchema>;

export const CONTRACT_ERROR_IDS = {
  auth: 'error:auth',
  rateLimit: 'error:rate',
  unavailable: 'error:down',
} as const;

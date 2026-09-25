import { z } from 'zod';

export const idParamSchema = z.object({
  id: z.uuid(),
});

export const listTransactionsQuerySchema = z.object({
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

export const dashboardQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export const listNotificationsQuerySchema = z.object({
  unread: z
    .union([z.boolean(), z.literal('true'), z.literal('false')])
    .optional()
    .transform((value) => value === true || value === 'true'),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

export type IdParam = z.infer<typeof idParamSchema>;
export type ListTransactionsQuery = z.infer<typeof listTransactionsQuerySchema>;
export type DashboardQuery = z.infer<typeof dashboardQuerySchema>;
export type ListNotificationsQuery = z.infer<typeof listNotificationsQuerySchema>;

import { z } from 'zod';

export const createInstallmentPlanSchema = z.object({
  description: z.string().min(1).max(120),
  totalAmount: z.number().positive(),
  installmentsCount: z.number().int().min(2).max(60),
  purchaseDate: z.iso.datetime(),
  accountId: z.uuid(),
  categoryId: z.uuid(),
});

export type CreateInstallmentPlanDto = z.infer<typeof createInstallmentPlanSchema>;

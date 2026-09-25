import { z } from 'zod';

export const createBudgetSchema = z.object({
  categoryId: z.uuid(),
  amount: z.number().positive(),
});

export const updateBudgetSchema = z.object({
  amount: z.number().positive(),
});

export const listBudgetsQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
});

export type CreateBudgetDto = z.infer<typeof createBudgetSchema>;
export type UpdateBudgetDto = z.infer<typeof updateBudgetSchema>;
export type ListBudgetsQuery = z.infer<typeof listBudgetsQuerySchema>;

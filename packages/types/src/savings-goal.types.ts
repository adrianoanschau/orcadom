import { z } from 'zod';

export const savingsGoalStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'ABANDONED']);

export const createSavingsGoalSchema = z.object({
  name: z.string().trim().min(1).max(80),
  targetAmount: z.number().positive(),
  accountId: z.uuid(),
  targetDate: z.iso.datetime().optional(),
  startDate: z.iso.datetime().optional(),
});

export const updateSavingsGoalSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    targetAmount: z.number().positive().optional(),
    targetDate: z.iso.datetime().nullable().optional(),
    startDate: z.iso.datetime().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo.' });

export type CreateSavingsGoalDto = z.infer<typeof createSavingsGoalSchema>;
export type UpdateSavingsGoalDto = z.infer<typeof updateSavingsGoalSchema>;
export type SavingsGoalStatus = z.infer<typeof savingsGoalStatusSchema>;

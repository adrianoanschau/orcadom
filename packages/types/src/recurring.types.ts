import { z } from 'zod';

export const recurrenceFrequencySchema = z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']);

export const createRecurringTransactionSchema = z
  .object({
    description: z.string().min(1).max(120),
    amount: z.number().positive(),
    type: z.enum(['INCOME', 'EXPENSE']),
    frequency: recurrenceFrequencySchema,
    dayOfMonth: z.number().int().min(1).max(31).optional(),
    startDate: z.iso.datetime(),
    endDate: z.iso.datetime().optional(),
    accountId: z.uuid(),
    categoryId: z.uuid(),
  })
  .superRefine((value, context) => {
    if (value.frequency === 'MONTHLY' && value.dayOfMonth === undefined) {
      context.addIssue({
        code: 'custom',
        path: ['dayOfMonth'],
        message: 'Informe o dia do mês.',
      });
    }
    if (value.endDate && value.endDate < value.startDate) {
      context.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'A data de fim deve ser posterior ao início.',
      });
    }
  });

export const updateRecurringTransactionSchema = z
  .object({
    description: z.string().min(1).max(120).optional(),
    amount: z.number().positive().optional(),
    frequency: recurrenceFrequencySchema.optional(),
    dayOfMonth: z.number().int().min(1).max(31).nullable().optional(),
    endDate: z.iso.datetime().nullable().optional(),
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo.' });

export type CreateRecurringTransactionDto = z.infer<typeof createRecurringTransactionSchema>;
export type UpdateRecurringTransactionDto = z.infer<typeof updateRecurringTransactionSchema>;

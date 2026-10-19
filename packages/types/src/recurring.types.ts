import { z } from 'zod';

export const recurrenceFrequencySchema = z.enum(['WEEKLY', 'MONTHLY', 'YEARLY']);

export const recurrenceModeSchema = z.enum(['AUTO_POST', 'BILL']);

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
    categoryId: z.uuid().optional(),
    mode: recurrenceModeSchema.optional(),
    targetAccountId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    const mode = value.mode ?? 'AUTO_POST';
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
    if (mode === 'BILL' && value.type !== 'EXPENSE') {
      context.addIssue({
        code: 'custom',
        path: ['type'],
        message: 'Conta a pagar recorrente só vale para despesa.',
      });
    }
    if (value.targetAccountId && mode !== 'BILL') {
      context.addIssue({
        code: 'custom',
        path: ['targetAccountId'],
        message: 'A conta do cartão só vale ao criar uma conta a pagar.',
      });
    }
    if (value.targetAccountId && value.targetAccountId === value.accountId) {
      context.addIssue({
        code: 'custom',
        path: ['targetAccountId'],
        message: 'A conta do cartão deve ser diferente da conta que paga.',
      });
    }
    if (!value.targetAccountId && !value.categoryId) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Categoria é obrigatória.',
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
    categoryId: z.uuid().nullable().optional(),
    mode: recurrenceModeSchema.optional(),
    targetAccountId: z.uuid().nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo.' });

export type CreateRecurringTransactionDto = z.infer<typeof createRecurringTransactionSchema>;
export type UpdateRecurringTransactionDto = z.infer<typeof updateRecurringTransactionSchema>;

import { z } from 'zod';

const monthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const daySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/);

const flagSchema = z
  .union([z.boolean(), z.literal('true'), z.literal('false')])
  .optional()
  .transform((value) => value === true || value === 'true');

export const createBillSchema = z
  .object({
    description: z.string().min(1).max(120),
    amount: z.number().positive(),
    dueDate: daySchema,
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    targetAccountId: z.uuid().optional(),
    notes: z.string().max(500).optional(),
  })
  .superRefine((value, context) => {
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

export const updateBillSchema = z
  .object({
    description: z.string().min(1).max(120).optional(),
    amount: z.number().positive().optional(),
    dueDate: daySchema.optional(),
    accountId: z.uuid().nullable().optional(),
    categoryId: z.uuid().nullable().optional(),
    targetAccountId: z.uuid().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'Informe ao menos um campo.' });

export const payBillSchema = z.object({
  accountId: z.uuid(),
  amount: z.number().positive().optional(),
  date: z.iso.datetime().optional(),
  categoryId: z.uuid().optional(),
});

export const linkBillTransactionSchema = z.object({
  transactionId: z.uuid(),
});

export const listBillsQuerySchema = z.object({
  month: monthSchema,
  includeOverdue: flagSchema,
  includeCanceled: flagSchema,
});

export const billSummaryQuerySchema = z.object({
  month: monthSchema,
});

export type CreateBillDto = z.infer<typeof createBillSchema>;
export type UpdateBillDto = z.infer<typeof updateBillSchema>;
export type PayBillDto = z.infer<typeof payBillSchema>;
export type LinkBillTransactionDto = z.infer<typeof linkBillTransactionSchema>;
export type ListBillsQuery = z.infer<typeof listBillsQuerySchema>;
export type BillSummaryQuery = z.infer<typeof billSummaryQuerySchema>;

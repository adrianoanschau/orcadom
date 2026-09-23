import { z } from 'zod';

export const createTransactionSchema = z
  .object({
    description: z.string().min(1).max(120),
    amount: z.number().positive(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
    date: z.iso.datetime(),
    accountId: z.uuid().optional(),
    categoryId: z.uuid().optional(),
    fromAccountId: z.uuid().optional(),
    toAccountId: z.uuid().optional(),
  })
  .superRefine((value, context) => {
    if (value.type === 'TRANSFER') {
      if (!value.fromAccountId) {
        context.addIssue({
          code: 'custom',
          path: ['fromAccountId'],
          message: 'Conta de origem é obrigatória.',
        });
      }
      if (!value.toAccountId) {
        context.addIssue({
          code: 'custom',
          path: ['toAccountId'],
          message: 'Conta de destino é obrigatória.',
        });
      }
      if (value.fromAccountId && value.fromAccountId === value.toAccountId) {
        context.addIssue({
          code: 'custom',
          path: ['toAccountId'],
          message: 'A conta de destino deve ser diferente da origem.',
        });
      }
      return;
    }

    if (!value.accountId) {
      context.addIssue({
        code: 'custom',
        path: ['accountId'],
        message: 'Conta é obrigatória.',
      });
    }
    if (!value.categoryId) {
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Categoria é obrigatória.',
      });
    }
  });

export type CreateTransactionDto = z.infer<typeof createTransactionSchema>;

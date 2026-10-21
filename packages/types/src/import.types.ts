import { z } from 'zod';

export const createImportSchema = z.object({
  accountId: z.uuid(),
});

export const importBatchParamSchema = z.object({
  batchId: z.uuid(),
});

export const confirmImportSchema = z.object({
  accountId: z.uuid().optional(),
  rows: z
    .array(
      z
        .object({
          lineId: z.uuid(),
          action: z.enum(['IMPORT', 'SKIP', 'LINK_TRANSACTION', 'PAY_BILL', 'RECORD_TRANSFER']).optional(),
          categoryId: z.uuid().optional(),
          transactionId: z.uuid().optional(),
          billId: z.uuid().optional(),
          counterAccountId: z.uuid().optional(),
        })
        .superRefine((value, context) => {
          const action = value.action ?? 'IMPORT';
          if (action === 'IMPORT' && !value.categoryId) {
            context.addIssue({
              code: 'custom',
              path: ['categoryId'],
              message: 'Categoria é obrigatória.',
            });
          }
          if (action === 'LINK_TRANSACTION' && !value.transactionId) {
            context.addIssue({
              code: 'custom',
              path: ['transactionId'],
              message: 'Informe o lançamento a vincular.',
            });
          }
          if (action === 'PAY_BILL' && !value.billId) {
            context.addIssue({
              code: 'custom',
              path: ['billId'],
              message: 'Informe a conta a pagar.',
            });
          }
          if (action === 'RECORD_TRANSFER' && !value.counterAccountId) {
            context.addIssue({
              code: 'custom',
              path: ['counterAccountId'],
              message: 'Informe a outra conta da transferência.',
            });
          }
        }),
    )
    .min(1),
});

export type CreateImportDto = z.infer<typeof createImportSchema>;
export type ConfirmImportDto = z.infer<typeof confirmImportSchema>;
export type ImportBatchParam = z.infer<typeof importBatchParamSchema>;

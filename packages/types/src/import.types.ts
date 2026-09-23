import { z } from 'zod';

export const createImportSchema = z.object({
  accountId: z.uuid(),
});

export const importBatchParamSchema = z.object({
  batchId: z.uuid(),
});

export const confirmImportSchema = z.object({
  rows: z
    .array(
      z.object({
        lineId: z.uuid(),
        categoryId: z.uuid(),
      }),
    )
    .min(1),
});

export type CreateImportDto = z.infer<typeof createImportSchema>;
export type ConfirmImportDto = z.infer<typeof confirmImportSchema>;
export type ImportBatchParam = z.infer<typeof importBatchParamSchema>;

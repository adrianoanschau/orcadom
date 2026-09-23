import { z } from 'zod';

export const emailImportSchema = z.object({
  token: z.string().trim().min(1).max(32),
  attachment: z.string().min(1),
  messageId: z.string().trim().min(1).max(300),
  recipientAddress: z.string().trim().min(1).max(320),
  fileName: z.string().trim().min(1).max(180).optional(),
});

export const createBankAccountMappingSchema = z.object({
  bankId: z.string().trim().min(1).max(64),
  acctId: z.string().trim().min(1).max(64),
  accountId: z.uuid(),
});

export const updateBankAccountMappingSchema = z.object({
  accountId: z.uuid(),
});

export const emailImportLogsQuerySchema = z.object({
  status: z
    .enum(['PROCESSED', 'SKIPPED_DUPLICATE', 'UNRECOGNIZED_TOKEN', 'UNMAPPED_ACCOUNT', 'ERROR'])
    .optional(),
});

export type EmailImportDto = z.infer<typeof emailImportSchema>;
export type CreateBankAccountMappingDto = z.infer<typeof createBankAccountMappingSchema>;
export type UpdateBankAccountMappingDto = z.infer<typeof updateBankAccountMappingSchema>;
export type EmailImportLogsQuery = z.infer<typeof emailImportLogsQuerySchema>;

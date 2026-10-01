import { z } from 'zod';
import { includeDescendantsSchema } from './query.types.js';

export const REPORT_SYNC_THRESHOLD = 2000;
export const REPORT_PDF_WARN_THRESHOLD = 500;

export const reportFormatSchema = z.enum(['PDF', 'XLSX']);
export const reportStatusSchema = z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED']);

export const reportFiltersSchema = z.object({
  accountId: z.uuid().optional(),
  categoryId: z.uuid().optional(),
  includeDescendants: includeDescendantsSchema,
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
});

export const createReportSchema = reportFiltersSchema.extend({
  format: reportFormatSchema,
});

export const reportParamSchema = z.object({
  id: z.uuid(),
});

export type ReportFormat = z.infer<typeof reportFormatSchema>;
export type ReportStatus = z.infer<typeof reportStatusSchema>;
export type ReportFilters = z.infer<typeof reportFiltersSchema>;
export type CreateReportDto = z.infer<typeof createReportSchema>;
export type ReportParam = z.infer<typeof reportParamSchema>;

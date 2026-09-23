import {
  confirmImportSchema,
  createImportSchema,
  importBatchParamSchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateImportBody extends createZodDto(createImportSchema) {}
export class ConfirmImportBody extends createZodDto(confirmImportSchema) {}
export class ImportBatchParams extends createZodDto(importBatchParamSchema) {}

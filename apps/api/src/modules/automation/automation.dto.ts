import { emailImportLogsQuerySchema, emailImportSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class EmailImportBody extends createZodDto(emailImportSchema) {}
export class EmailImportLogsQuery extends createZodDto(emailImportLogsQuerySchema) {}

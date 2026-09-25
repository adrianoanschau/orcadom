import { listAuditLogsQuerySchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class ListAuditLogsQueryDto extends createZodDto(listAuditLogsQuerySchema) {}

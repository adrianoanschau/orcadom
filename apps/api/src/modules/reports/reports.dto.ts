import { createReportSchema, reportParamSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateReportBody extends createZodDto(createReportSchema) {}
export class ReportParams extends createZodDto(reportParamSchema) {}

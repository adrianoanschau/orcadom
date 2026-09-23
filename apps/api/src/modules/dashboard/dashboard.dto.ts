import { dashboardQuerySchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class DashboardQueryDto extends createZodDto(dashboardQuerySchema) {}

import { createInstallmentPlanSchema, idParamSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateInstallmentPlanBody extends createZodDto(createInstallmentPlanSchema) {}
export class InstallmentPlanParams extends createZodDto(idParamSchema) {}

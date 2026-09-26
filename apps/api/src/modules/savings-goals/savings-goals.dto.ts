import { createSavingsGoalSchema, idParamSchema, updateSavingsGoalSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateSavingsGoalBody extends createZodDto(createSavingsGoalSchema) {}
export class UpdateSavingsGoalBody extends createZodDto(updateSavingsGoalSchema) {}
export class SavingsGoalParams extends createZodDto(idParamSchema) {}

import {
  createBudgetSchema,
  idParamSchema,
  listBudgetsQuerySchema,
  updateBudgetSchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateBudgetBody extends createZodDto(createBudgetSchema) {}
export class UpdateBudgetBody extends createZodDto(updateBudgetSchema) {}
export class ListBudgetsQueryDto extends createZodDto(listBudgetsQuerySchema) {}
export class BudgetParams extends createZodDto(idParamSchema) {}

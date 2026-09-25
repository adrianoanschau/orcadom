import {
  createRecurringTransactionSchema,
  idParamSchema,
  updateRecurringTransactionSchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateRecurringTransactionBody extends createZodDto(createRecurringTransactionSchema) {}
export class UpdateRecurringTransactionBody extends createZodDto(updateRecurringTransactionSchema) {}
export class RecurringTransactionParams extends createZodDto(idParamSchema) {}

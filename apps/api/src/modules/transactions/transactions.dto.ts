import {
  createTransactionSchema,
  idParamSchema,
  listTransactionsQuerySchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateTransactionBody extends createZodDto(createTransactionSchema) {}
export class UpdateTransactionBody extends createZodDto(createTransactionSchema) {}
export class TransactionParams extends createZodDto(idParamSchema) {}
export class ListTransactionsQueryDto extends createZodDto(listTransactionsQuerySchema) {}

import { createZodDto } from 'nestjs-zod';
import {
  billSummaryQuerySchema,
  createBillSchema,
  idParamSchema,
  linkBillTransactionSchema,
  listBillsQuerySchema,
  payBillSchema,
  updateBillSchema,
} from '@orcadom/types';

export class CreateBillBody extends createZodDto(createBillSchema) {}
export class UpdateBillBody extends createZodDto(updateBillSchema) {}
export class PayBillBody extends createZodDto(payBillSchema) {}
export class LinkBillTransactionBody extends createZodDto(linkBillTransactionSchema) {}
export class ListBillsQueryDto extends createZodDto(listBillsQuerySchema) {}
export class BillSummaryQueryDto extends createZodDto(billSummaryQuerySchema) {}
export class BillParams extends createZodDto(idParamSchema) {}

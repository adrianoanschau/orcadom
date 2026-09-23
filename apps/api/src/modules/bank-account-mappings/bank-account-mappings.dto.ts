import { createBankAccountMappingSchema, idParamSchema, updateBankAccountMappingSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateBankAccountMappingBody extends createZodDto(createBankAccountMappingSchema) {}
export class UpdateBankAccountMappingBody extends createZodDto(updateBankAccountMappingSchema) {}
export class BankAccountMappingParams extends createZodDto(idParamSchema) {}

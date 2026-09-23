import { createAccountSchema, idParamSchema, updateAccountSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateAccountBody extends createZodDto(createAccountSchema) {}
export class UpdateAccountBody extends createZodDto(updateAccountSchema) {}
export class AccountParams extends createZodDto(idParamSchema) {}

import { createAccountSchema, idParamSchema, restrictAccountSchema, updateAccountSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateAccountBody extends createZodDto(createAccountSchema) {}
export class UpdateAccountBody extends createZodDto(updateAccountSchema) {}
export class RestrictAccountBody extends createZodDto(restrictAccountSchema) {}
export class AccountParams extends createZodDto(idParamSchema) {}

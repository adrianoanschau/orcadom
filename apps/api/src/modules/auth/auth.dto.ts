import { loginSchema, registerSchema } from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class RegisterBody extends createZodDto(registerSchema) {}
export class LoginBody extends createZodDto(loginSchema) {}

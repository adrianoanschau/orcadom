import { z } from 'zod';

export const accountTypeSchema = z.enum(['WALLET', 'CHECKING', 'CREDIT_CARD']);

export const createAccountSchema = z.object({
  name: z.string().trim().min(1).max(60),
  type: accountTypeSchema,
  balance: z.number().nonnegative().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

export const updateAccountSchema = z
  .object({
    name: z.string().trim().min(1).max(60).optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
  })
  .refine((value) => value.name !== undefined || value.color !== undefined, {
    message: 'Informe nome ou cor para atualizar.',
  });

export type CreateAccountDto = z.infer<typeof createAccountSchema>;
export type UpdateAccountDto = z.infer<typeof updateAccountSchema>;

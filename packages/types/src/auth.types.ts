import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email(),
  password: z.string().min(8).max(72),
});

export const registerFormSchema = registerSchema
  .extend({
    confirmPassword: z.string().min(1),
  })
  .refine((data) => data.password === data.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não coincidem.',
  });

export const loginSchema = z.object({
  email: z.email(),
  password: z.string().min(1).max(72),
  rememberMe: z.boolean().default(false),
});

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    currentPassword: z.string().min(1).max(72).optional(),
    newPassword: z.string().min(8).max(72).optional(),
  })
  .refine((data) => Boolean(data.name) || Boolean(data.newPassword), {
    message: 'Informe um nome ou uma nova senha.',
  })
  .refine((data) => !data.newPassword || Boolean(data.currentPassword), {
    path: ['currentPassword'],
    message: 'Informe a senha atual para definir uma nova.',
  });

export type RegisterDto = z.infer<typeof registerSchema>;
export type RegisterFormDto = z.infer<typeof registerFormSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

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

export type RegisterDto = z.infer<typeof registerSchema>;
export type RegisterFormDto = z.infer<typeof registerFormSchema>;
export type LoginDto = z.infer<typeof loginSchema>;

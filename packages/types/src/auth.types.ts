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
  remember: z.boolean(),
  rememberMe: z.boolean().optional(),
});

export const dateFormatPreferenceSchema = z.enum(['PT_BR', 'EN_US', 'SYSTEM']);

export const localePreferenceSchema = z.enum(['pt-BR', 'en-US', 'system']);

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(1).max(80).optional(),
    dateFormatPreference: dateFormatPreferenceSchema.optional(),
  })
  .refine((data) => Boolean(data.name) || Boolean(data.dateFormatPreference), {
    message: 'Informe um dado para atualizar.',
  });

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(72),
  newPassword: z.string().min(8).max(72),
});

export type RegisterDto = z.infer<typeof registerSchema>;
export type RegisterFormDto = z.infer<typeof registerFormSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type DateFormatPreference = z.infer<typeof dateFormatPreferenceSchema>;
export type LocalePreference = z.infer<typeof localePreferenceSchema>;

const dateFormatToLocale: Record<DateFormatPreference, LocalePreference> = {
  PT_BR: 'pt-BR',
  EN_US: 'en-US',
  SYSTEM: 'system',
};

const localeToDateFormat: Record<LocalePreference, DateFormatPreference> = {
  'pt-BR': 'PT_BR',
  'en-US': 'EN_US',
  system: 'SYSTEM',
};

export function toLocalePreference(value: DateFormatPreference): LocalePreference {
  return dateFormatToLocale[value];
}

export function toDateFormatPreference(value: LocalePreference): DateFormatPreference {
  return localeToDateFormat[value];
}

export function loginRemember(dto: Pick<LoginDto, 'remember' | 'rememberMe'>): boolean {
  return Boolean(dto.remember || dto.rememberMe);
}

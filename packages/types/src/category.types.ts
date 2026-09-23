import { z } from 'zod';

export const categoryTypeSchema = z.enum(['INCOME', 'EXPENSE']);

export const createCategorySchema = z.object({
  name: z.string().trim().min(1).max(40),
  type: categoryTypeSchema,
  icon: z.string().trim().min(1).max(40).optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .optional(),
});

export const updateCategorySchema = z
  .object({
    name: z.string().trim().min(1).max(40).optional(),
    icon: z.string().trim().min(1).max(40).nullable().optional(),
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .nullable()
      .optional(),
  })
  .refine(
    (value) => value.name !== undefined || value.icon !== undefined || value.color !== undefined,
    {
      message: 'Informe ao menos um campo para atualizar.',
    },
  );

export const listCategoriesQuerySchema = z.object({
  type: categoryTypeSchema.optional(),
});

export type CreateCategoryDto = z.infer<typeof createCategorySchema>;
export type UpdateCategoryDto = z.infer<typeof updateCategorySchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;

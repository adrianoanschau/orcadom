import {
  createCategorySchema,
  idParamSchema,
  listCategoriesQuerySchema,
  updateCategorySchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';

export class CreateCategoryBody extends createZodDto(createCategorySchema) {}
export class UpdateCategoryBody extends createZodDto(updateCategorySchema) {}
export class CategoryParams extends createZodDto(idParamSchema) {}
export class ListCategoriesQueryDto extends createZodDto(listCategoriesQuerySchema) {}

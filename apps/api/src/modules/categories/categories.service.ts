import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { CreateCategoryDto, ListCategoriesQuery, UpdateCategoryDto } from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateCategoryDto): Promise<CategoryResponse> {
    try {
      const category = await this.prisma.client.category.create({
        data: { householdId, name: dto.name, type: dto.type, icon: dto.icon, color: dto.color },
      });
      return this.toResponse(category);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe uma categoria com esse nome e tipo.');
      }
      throw error;
    }
  }

  async list(householdId: string, query: ListCategoriesQuery): Promise<CategoryResponse[]> {
    const categories = await this.prisma.client.category.findMany({
      where: { householdId, ...(query.type ? { type: query.type } : {}) },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
    return categories.map((category) => this.toResponse(category));
  }

  async update(householdId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    await this.findOwned(householdId, id);
    try {
      const category = await this.prisma.client.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
        },
      });
      return this.toResponse(category);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe uma categoria com esse nome e tipo.');
      }
      throw error;
    }
  }

  async remove(householdId: string, id: string): Promise<void> {
    await this.findOwned(householdId, id);
    const linked = await this.prisma.client.transaction.count({
      where: { householdId, categoryId: id },
    });
    if (linked > 0) {
      throw new ConflictException('A categoria possui lançamentos e não pode ser excluída.');
    }
    await this.prisma.client.category.delete({ where: { id } });
  }

  private async findOwned(householdId: string, id: string) {
    const category = await this.prisma.client.category.findFirst({ where: { id, householdId } });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    return category;
  }

  private toResponse(category: {
    id: string;
    name: string;
    type: string;
    icon: string | null;
    color: string | null;
  }): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
    };
  }
}

interface CategoryResponse {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

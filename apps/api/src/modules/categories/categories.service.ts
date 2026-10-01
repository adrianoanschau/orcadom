import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  assessCategoryPlacement,
  categoryDepth,
  type CategoryPlacement,
  type CreateCategoryDto,
  type ListCategoriesQuery,
  type UpdateCategoryDto,
} from '@orcadom/types';
import { PrismaService } from '../../common/prisma.service.js';

const SYSTEM_LOCKED = 'Categorias do sistema não podem ser alteradas.';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(householdId: string, dto: CreateCategoryDto): Promise<CategoryResponse> {
    const items = await this.links(householdId);
    const placement = assessCategoryPlacement(items, {
      parentId: dto.parentId ?? null,
      type: dto.type,
    });
    const depth = this.depthFrom(placement);
    try {
      const category = await this.prisma.client.category.create({
        data: {
          householdId,
          name: dto.name,
          type: dto.type,
          icon: dto.icon,
          color: dto.color,
          parentId: dto.parentId ?? null,
          isSystem: false,
        },
      });
      return this.toResponse(category, depth);
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
    return categories.map((category) => this.toResponse(category, categoryDepth(categories, category.id)));
  }

  async update(householdId: string, id: string, dto: UpdateCategoryDto): Promise<CategoryResponse> {
    const current = await this.findOwned(householdId, id);
    if (current.isSystem) {
      throw new ForbiddenException(SYSTEM_LOCKED);
    }
    const items = await this.links(householdId);
    let depth = categoryDepth(items, current.id);
    if (dto.parentId !== undefined && dto.parentId !== current.parentId) {
      const placement = assessCategoryPlacement(items, {
        id: current.id,
        parentId: dto.parentId,
        type: current.type,
      });
      depth = this.depthFrom(placement);
    }
    try {
      const category = await this.prisma.client.category.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name } : {}),
          ...(dto.icon !== undefined ? { icon: dto.icon } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.parentId !== undefined ? { parentId: dto.parentId } : {}),
        },
      });
      return this.toResponse(category, depth);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Já existe uma categoria com esse nome e tipo.');
      }
      throw error;
    }
  }

  async remove(householdId: string, id: string): Promise<void> {
    const current = await this.findOwned(householdId, id);
    if (current.isSystem) {
      throw new ForbiddenException('Categorias do sistema não podem ser excluídas.');
    }
    const [children, transactions, plans, recurring, budgets] = await Promise.all([
      this.prisma.client.category.count({ where: { householdId, parentId: id } }),
      this.prisma.client.transaction.count({ where: { householdId, categoryId: id } }),
      this.prisma.client.installmentPlan.count({ where: { householdId, categoryId: id } }),
      this.prisma.client.recurringTransaction.count({ where: { householdId, categoryId: id } }),
      this.prisma.client.budget.count({ where: { householdId, categoryId: id } }),
    ]);
    if (children > 0) {
      throw new ConflictException('A categoria possui subcategorias e não pode ser excluída.');
    }
    if (transactions > 0) {
      throw new ConflictException('A categoria possui lançamentos e não pode ser excluída.');
    }
    if (plans > 0 || recurring > 0 || budgets > 0) {
      throw new ConflictException('A categoria está em uso e não pode ser excluída.');
    }
    await this.prisma.client.category.delete({ where: { id } });
  }

  private async links(householdId: string) {
    return this.prisma.client.category.findMany({
      where: { householdId },
      select: { id: true, parentId: true, type: true },
    });
  }

  private depthFrom(placement: CategoryPlacement): number {
    if (placement.ok) return placement.depth;
    if (placement.reason === 'missing_parent') {
      throw new NotFoundException('Categoria pai não encontrada.');
    }
    if (placement.reason === 'type_mismatch') {
      throw new BadRequestException('A subcategoria precisa ter o mesmo tipo da categoria pai.');
    }
    if (placement.reason === 'cycle') {
      throw new BadRequestException('Uma categoria não pode ficar dentro de si mesma.');
    }
    throw new BadRequestException('A árvore de categorias aceita no máximo 3 níveis.');
  }

  private async findOwned(householdId: string, id: string) {
    const category = await this.prisma.client.category.findFirst({ where: { id, householdId } });
    if (!category) {
      throw new NotFoundException('Categoria não encontrada.');
    }
    return category;
  }

  private toResponse(
    category: {
      id: string;
      name: string;
      type: string;
      icon: string | null;
      color: string | null;
      parentId: string | null;
      isSystem: boolean;
    },
    depth: number,
  ): CategoryResponse {
    return {
      id: category.id,
      name: category.name,
      type: category.type,
      icon: category.icon,
      color: category.color,
      parentId: category.parentId,
      depth,
      isSystem: category.isSystem,
    };
  }
}

interface CategoryResponse {
  id: string;
  name: string;
  type: string;
  icon: string | null;
  color: string | null;
  parentId: string | null;
  depth: number;
  isSystem: boolean;
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

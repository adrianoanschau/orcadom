import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';
import { normalizeDescription } from './category-memory.js';

export interface CategorySuggestion {
  categoryId: string;
  confidence: 'high' | 'low';
  source: 'memory' | 'similarity';
}

interface MemoryWriter {
  categoryMemory: {
    upsert(args: {
      where: {
        householdId_pattern_categoryId: { householdId: string; pattern: string; categoryId: string };
      };
      update: { occurrences: { increment: number }; lastUsedAt: Date };
      create: { householdId: string; pattern: string; categoryId: string; occurrences: number };
    }): Promise<unknown>;
  };
}

@Injectable()
export class CategoryMemoryService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(
    householdId: string,
    description: string,
    categoryId: string,
    db: MemoryWriter = this.prisma.client,
  ): Promise<void> {
    const pattern = normalizeDescription(description);
    if (!pattern) return;

    await db.categoryMemory.upsert({
      where: { householdId_pattern_categoryId: { householdId, pattern, categoryId } },
      update: { occurrences: { increment: 1 }, lastUsedAt: new Date() },
      create: { householdId, pattern, categoryId, occurrences: 1 },
    });
  }

  async suggestAll(householdId: string, descriptions: string[]): Promise<(CategorySuggestion | null)[]> {
    const patterns = descriptions.map((description) => normalizeDescription(description));
    const unique = [...new Set(patterns.filter(Boolean))];
    const memories =
      unique.length > 0
        ? await this.prisma.client.categoryMemory.findMany({
            where: { householdId, pattern: { in: unique } },
            orderBy: [{ occurrences: 'desc' }, { lastUsedAt: 'desc' }],
          })
        : [];

    const exactByPattern = new Map<string, (typeof memories)[number]>();
    for (const memory of memories) {
      if (!exactByPattern.has(memory.pattern)) {
        exactByPattern.set(memory.pattern, memory);
      }
    }

    const suggestions: (CategorySuggestion | null)[] = [];
    for (const [index, description] of descriptions.entries()) {
      const pattern = patterns[index];
      const exact = pattern ? exactByPattern.get(pattern) : undefined;
      if (exact) {
        suggestions.push({ categoryId: exact.categoryId, confidence: 'high', source: 'memory' });
        continue;
      }
      suggestions.push(await this.suggestBySimilarity(householdId, description));
    }
    return suggestions;
  }

  private async suggestBySimilarity(
    householdId: string,
    rawDescription: string,
  ): Promise<CategorySuggestion | null> {
    if (!rawDescription.trim()) return null;

    const similar = await this.prisma.client.$queryRaw<{ categoryId: string; score: number }[]>`
      SELECT "categoryId", similarity(description, ${rawDescription}) AS score
      FROM transactions
      WHERE "householdId" = ${householdId}
        AND "categoryId" IS NOT NULL
        AND similarity(description, ${rawDescription}) >= 0.25
      ORDER BY score DESC
      LIMIT 1
    `;

    const match = similar[0];
    if (!match) return null;
    return { categoryId: match.categoryId, confidence: 'low', source: 'similarity' };
  }
}

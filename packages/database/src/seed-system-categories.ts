import { CategoryType } from './generated/prisma/client.js';
import { runWithActor } from './actor-context.js';

export const SYSTEM_CATEGORIES = [
  { systemKey: 'HOUSING', name: 'Moradia', type: CategoryType.EXPENSE, color: '#8B5E3C' },
  { systemKey: 'HOME_BILLS', name: 'Contas da casa', type: CategoryType.EXPENSE, color: '#D08C2F' },
  { systemKey: 'GROCERIES', name: 'Mercado', type: CategoryType.EXPENSE, color: '#7A8B2E' },
  { systemKey: 'TRANSPORT', name: 'Transporte', type: CategoryType.EXPENSE, color: '#5B6C9D' },
  { systemKey: 'HEALTH', name: 'Saúde', type: CategoryType.EXPENSE, color: '#B5527A' },
  { systemKey: 'EDUCATION', name: 'Educação', type: CategoryType.EXPENSE, color: '#4B3F8F' },
  { systemKey: 'DINING_OUT', name: 'Restaurantes e delivery', type: CategoryType.EXPENSE, color: '#D9702E' },
  { systemKey: 'LEISURE_TRAVEL', name: 'Lazer e viagens', type: CategoryType.EXPENSE, color: '#2A9DB5' },
  { systemKey: 'SUBSCRIPTIONS', name: 'Assinaturas', type: CategoryType.EXPENSE, color: '#A66CC9' },
  { systemKey: 'SHOPPING', name: 'Compras', type: CategoryType.EXPENSE, color: '#6E7F8D' },
  { systemKey: 'PERSONAL_CARE', name: 'Cuidados pessoais', type: CategoryType.EXPENSE, color: '#C77DA3' },
  { systemKey: 'PETS', name: 'Pets', type: CategoryType.EXPENSE, color: '#A0764A' },
  { systemKey: 'TAXES_FEES', name: 'Impostos e taxas', type: CategoryType.EXPENSE, color: '#7D6B5D' },
  { systemKey: 'GIFTS_DONATIONS', name: 'Presentes e doações', type: CategoryType.EXPENSE, color: '#C25D5D' },
  { systemKey: 'CONTINGENCIES', name: 'Imprevistos', type: CategoryType.EXPENSE, color: '#9A8F3C' },
  { systemKey: 'OTHER_EXPENSE', name: 'Outros', type: CategoryType.EXPENSE, color: '#8A9199' },
  { systemKey: 'SALARY', name: 'Salário', type: CategoryType.INCOME, color: '#3B6E91' },
  { systemKey: 'FREELANCE', name: 'Freelance e extras', type: CategoryType.INCOME, color: '#4A8FA8' },
  { systemKey: 'INVESTMENT_INCOME', name: 'Rendimentos', type: CategoryType.INCOME, color: '#5B7FBF' },
  { systemKey: 'REFUNDS', name: 'Reembolsos', type: CategoryType.INCOME, color: '#6AA3B5' },
  { systemKey: 'GIFTS_RECEIVED', name: 'Presentes recebidos', type: CategoryType.INCOME, color: '#8E7CC3' },
  { systemKey: 'OTHER_INCOME', name: 'Outras receitas', type: CategoryType.INCOME, color: '#8A9199' },
] as const;

export interface SystemCategoryRow {
  id: string;
  name: string;
  type: CategoryType;
}

export interface CategorySeedClient {
  category: {
    upsert(args: {
      where: { householdId_systemKey: { householdId: string; systemKey: string } };
      create: {
        householdId: string;
        systemKey: string;
        name: string;
        type: CategoryType;
        color: string;
        isSystem: true;
        parentId: null;
      };
      update: {
        name: string;
        type: CategoryType;
        color: string;
        isSystem: true;
        parentId: null;
      };
    }): Promise<SystemCategoryRow> | SystemCategoryRow;
  };
}

export async function seedSystemCategories(
  tx: CategorySeedClient,
  householdId: string,
): Promise<Map<string, SystemCategoryRow>> {
  return runWithActor(
    { userId: null, householdId, source: 'SYSTEM', requestId: null },
    async () => {
      const byKey = new Map<string, SystemCategoryRow>();
      for (const category of SYSTEM_CATEGORIES) {
        const row = await tx.category.upsert({
          where: { householdId_systemKey: { householdId, systemKey: category.systemKey } },
          update: {
            name: category.name,
            type: category.type,
            color: category.color,
            isSystem: true,
            parentId: null,
          },
          create: {
            householdId,
            systemKey: category.systemKey,
            name: category.name,
            type: category.type,
            color: category.color,
            isSystem: true,
            parentId: null,
          },
        });
        byKey.set(category.systemKey, { id: row.id, name: row.name, type: row.type });
      }
      return byKey;
    },
  );
}

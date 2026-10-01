import { PrismaPg } from '@prisma/adapter-pg';
import {
  AccountType,
  AuditAction,
  AuditSource,
  CategoryType,
  DateFormatPreference,
  EmailImportStatus,
  HouseholdRole,
  ImportFormat,
  ImportSource,
  ImportStatus,
  InviteStatus,
  NotificationChannel,
  NotificationType,
  PostingStatus,
  Prisma,
  PrismaClient,
  RecurrenceFrequency,
  ReportFormat,
  ReportStatus,
  SavingsGoalStatus,
  TransactionSource,
  TransactionType,
} from './generated/prisma/client.js';
import { withAudit } from './audit.js';

const globalForPrisma = globalThis as unknown as { prisma?: AppPrismaClient };

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const adapter = new PrismaPg({ connectionString });
  return withAudit(new PrismaClient({ adapter }));
}

export type AppPrismaClient = ReturnType<typeof createPrismaClient>;

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export {
  SYSTEM_CATEGORIES,
  seedSystemCategories,
  type CategorySeedClient,
  type SystemCategoryRow,
} from './seed-system-categories.js';
export {
  actorContext,
  getActor,
  runWithActor,
  type ActorStore,
} from './actor-context.js';
export {
  AUDITED_MODELS,
  captureAuditWrite,
  formatAuditChanges,
  formatAuditContext,
  formatAuditHeadline,
  isAuditedModel,
  pickMetadata,
  sanitize,
  SENSITIVE_FIELDS,
} from './audit.js';

export {
  AccountType,
  AuditAction,
  AuditSource,
  CategoryType,
  DateFormatPreference,
  EmailImportStatus,
  HouseholdRole,
  ImportFormat,
  ImportSource,
  ImportStatus,
  InviteStatus,
  NotificationChannel,
  NotificationType,
  PostingStatus,
  Prisma,
  PrismaClient,
  RecurrenceFrequency,
  ReportFormat,
  ReportStatus,
  SavingsGoalStatus,
  TransactionSource,
  TransactionType,
};

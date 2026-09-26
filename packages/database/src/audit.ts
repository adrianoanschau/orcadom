import type { AuditAction, AuditSource, Prisma, PrismaClient } from './generated/prisma/client.js';
import { getActor } from './actor-context.js';

export const AUDITED_MODELS = [
  'Transaction',
  'Account',
  'Category',
  'Budget',
  'InstallmentPlan',
  'RecurringTransaction',
  'ImportBatch',
  'HouseholdMember',
  'SavingsGoal',
] as const;

export type AuditedModel = (typeof AUDITED_MODELS)[number];

const WRITE_OPS = new Set(['create', 'update', 'delete']);
const SENSITIVE_FIELDS = new Set(['passwordHash', 'token']);

const FIELD_LABELS: Record<string, string> = {
  description: 'descrição',
  amount: 'valor',
  date: 'data',
  type: 'tipo',
  name: 'nome',
  balance: 'saldo',
  color: 'cor',
  role: 'papel',
  effectiveFrom: 'início',
  effectiveTo: 'fim',
  active: 'ativo',
  status: 'status',
  postingStatus: 'status',
  fileName: 'arquivo',
  totalAmount: 'valor total',
  installmentsCount: 'parcelas',
  frequency: 'frequência',
  targetAmount: 'valor alvo',
  targetDate: 'prazo',
  startDate: 'início',
  completedAt: 'conclusão',
};

const MONEY_FIELDS = new Set(['amount', 'balance', 'totalAmount', 'targetAmount']);

const VALUE_LABELS: Record<string, Record<string, string>> = {
  role: { OWNER: 'responsável', MEMBER: 'membro' },
  type: {
    INCOME: 'receita',
    EXPENSE: 'despesa',
    TRANSFER: 'transferência',
    WALLET: 'carteira',
    CHECKING: 'conta corrente',
    CREDIT_CARD: 'cartão',
  },
  postingStatus: { SCHEDULED: 'agendada', POSTED: 'postada' },
  frequency: { WEEKLY: 'semanal', MONTHLY: 'mensal', YEARLY: 'anual' },
  status: { ACTIVE: 'ativa', COMPLETED: 'concluída', ABANDONED: 'abandonada' },
};

export interface AuditWriteInput {
  model: string;
  operation: string;
  args: { where?: unknown };
  query: (args: unknown) => Promise<unknown>;
  loadBefore: (where: unknown) => Promise<Record<string, unknown> | null>;
  writeLog: (data: {
    entityType: string;
    entityId: string;
    action: AuditAction;
    source: AuditSource;
    actorUserId: string | null;
    householdId: string | null;
    before: Prisma.InputJsonValue | undefined;
    after: Prisma.InputJsonValue | undefined;
    metadata: Prisma.InputJsonValue | undefined;
  }) => Promise<void>;
}

export function isAuditedModel(model: string): model is AuditedModel {
  return (AUDITED_MODELS as readonly string[]).includes(model);
}

export function sanitize(record: Record<string, unknown>): Prisma.InputJsonValue {
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    if (SENSITIVE_FIELDS.has(key)) continue;
    clean[key] = serializeValue(value);
  }
  return clean as Prisma.InputJsonValue;
}

export function pickMetadata(record: Record<string, unknown> | null): Prisma.InputJsonValue | undefined {
  if (!record) return undefined;
  const metadata: Record<string, unknown> = {};
  for (const key of ['importBatchId', 'recurringTransactionId', 'installmentPlanId'] as const) {
    if (typeof record[key] === 'string') metadata[key] = record[key];
  }
  return Object.keys(metadata).length > 0 ? (metadata as Prisma.InputJsonValue) : undefined;
}

export async function captureAuditWrite(input: AuditWriteInput): Promise<unknown> {
  if (!isAuditedModel(input.model) || !WRITE_OPS.has(input.operation)) {
    return input.query(input.args);
  }

  const actor = getActor();
  const before =
    input.operation === 'update' || input.operation === 'delete'
      ? await input.loadBefore(input.args.where)
      : null;

  const result = await input.query(input.args);
  const after = isRecord(result) ? result : null;
  const entityId = stringId(after?.id) ?? stringId(before?.id);
  if (!entityId) return result;

  const householdId =
    actor.householdId ??
    stringId(after?.householdId) ??
    stringId(before?.householdId);

  await input.writeLog({
    entityType: input.model,
    entityId,
    action: input.operation.toUpperCase() as AuditAction,
    source: actor.source,
    actorUserId: actor.userId,
    householdId,
    before: before ? sanitize(before) : undefined,
    after: input.operation === 'delete' || !after ? undefined : sanitize(after),
    metadata: pickMetadata(after ?? before),
  });

  return result;
}

export function withAudit(base: PrismaClient) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          return captureAuditWrite({
            model,
            operation,
            args: args as { where?: unknown },
            query: async (nextArgs) => query(nextArgs as typeof args),
            loadBefore: async (where) => {
              if (!where) return null;
              const delegate = modelDelegate(base, model);
              if (!delegate) return null;
              const row = await delegate.findUnique({ where });
              return isRecord(row) ? row : null;
            },
            writeLog: async (data) => {
              await base.auditLog.create({ data });
            },
          });
        },
      },
    },
  });
}

export function formatAuditHeadline(input: {
  action: AuditAction;
  source: AuditSource;
  actorName: string | null;
}): string {
  const verb =
    input.action === 'CREATE' ? 'Criado' : input.action === 'UPDATE' ? 'Editado' : 'Removido';
  if (input.source === 'USER') {
    return input.actorName ? `${verb} por ${input.actorName}` : `${verb} por um membro`;
  }
  if (input.source === 'AUTOMATION_EMAIL') return `${verb} pela importação por email`;
  if (input.source === 'CRON_INSTALLMENT') return `${verb} pelo job de parcelas`;
  if (input.source === 'CRON_RECURRING') return `${verb} pelo job de recorrência`;
  return `${verb} pelo sistema`;
}

export function formatAuditChanges(
  action: AuditAction,
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  metadata?: Record<string, unknown> | null,
): string[] {
  const changes =
    action === 'CREATE' && after
      ? describeSnapshot(after)
      : action === 'DELETE' && before
        ? describeSnapshot(before)
        : describeDiff(before, after);
  return [...changes, ...formatAuditContext(metadata ?? null)];
}

export function formatAuditContext(metadata: Record<string, unknown> | null): string[] {
  if (!metadata) return [];
  const lines: string[] = [];
  if (typeof metadata.importBatchId === 'string') lines.push('via importação de extrato');
  if (typeof metadata.recurringTransactionId === 'string') lines.push('via recorrência');
  if (typeof metadata.installmentPlanId === 'string') lines.push('via parcelamento');
  return lines;
}

function describeDiff(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): string[] {
  const changes: string[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    const label = FIELD_LABELS[key];
    if (!label) continue;
    const left = formatField(key, before?.[key]);
    const right = formatField(key, after?.[key]);
    if (left === right) continue;
    changes.push(`${label}: ${left} → ${right}`);
  }
  return changes;
}

function describeSnapshot(record: Record<string, unknown>): string[] {
  const lines: string[] = [];
  for (const key of ['name', 'description', 'amount', 'totalAmount', 'targetAmount', 'fileName', 'role']) {
    if (!(key in record)) continue;
    const label = FIELD_LABELS[key] ?? key;
    lines.push(`${label}: ${formatField(key, record[key])}`);
  }
  return lines;
}

function formatField(key: string, value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'sim' : 'não';
  const mapped =
    typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
      ? VALUE_LABELS[key]?.[String(value)]
      : undefined;
  if (mapped) return mapped;
  if (MONEY_FIELDS.has(key) && isNumeric(value)) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(Number(value))
      .replace(/[\u00a0\u202f]/g, ' ');
  }
  if (typeof value === 'number') return Number.isFinite(value) ? value.toFixed(2) : String(value);
  if (typeof value === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'UTC' }).format(
        new Date(value),
      );
    }
    return value;
  }
  return '—';
}

function isNumeric(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value);
}

function serializeValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (isDecimal(value)) return value.toFixed(2);
  if (Array.isArray(value)) return value.map((item) => serializeValue(item));
  return value;
}

function isDecimal(value: unknown): value is { toFixed(digits: number): string } {
  return value !== null && typeof value === 'object' && typeof Reflect.get(value, 'toFixed') === 'function';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function stringId(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function modelDelegate(base: PrismaClient, model: string) {
  const key = model.charAt(0).toLowerCase() + model.slice(1);
  const delegate: unknown = Reflect.get(base, key);
  if (delegate && typeof delegate === 'object' && typeof Reflect.get(delegate, 'findUnique') === 'function') {
    return delegate as unknown as { findUnique: (args: { where: unknown }) => Promise<unknown> };
  }
  return null;
}

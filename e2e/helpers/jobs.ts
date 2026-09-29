import { execFile } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { PostingStatus, type AppPrismaClient } from '@orcadom/database';

const execFileAsync = promisify(execFile);
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

let client: AppPrismaClient | undefined;

async function db(): Promise<AppPrismaClient> {
  if (!client) {
    const mod = await import('@orcadom/database');
    client = mod.prisma;
  }
  return client;
}

export async function runE2eJob(job: 'posting' | 'recurring'): Promise<number> {
  const { stdout } = await execFileAsync(
    'node',
    ['dist/run-e2e-job.js', job],
    {
      cwd: resolve(repoRoot, 'apps/api'),
      env: {
        ...process.env,
        CRON_DISABLED: 'true',
        COOKIE_SECURE: process.env.COOKIE_SECURE ?? 'false',
      },
      maxBuffer: 2 * 1024 * 1024,
    },
  );
  const line = stdout
    .split('\n')
    .map((row) => row.trim())
    .reverse()
    .find((row) => row.startsWith('{') && row.includes('"count"'));
  if (!line) {
    throw new Error(`Saída inesperada do job ${job}: ${stdout}`);
  }
  const parsed = JSON.parse(line) as { count: number };
  return parsed.count;
}

/** Move a primeira parcela SCHEDULED do plano para ontem (para o job postar sem esperar cron). */
export async function backdateNextScheduledInstallment(planId: string): Promise<string> {
  const prisma = await db();
  const scheduled = await prisma.transaction.findFirst({
    where: { installmentPlanId: planId, postingStatus: PostingStatus.SCHEDULED },
    orderBy: { installmentNumber: 'asc' },
  });
  if (!scheduled) {
    throw new Error(`Plano ${planId} sem parcela SCHEDULED.`);
  }
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(12, 0, 0, 0);
  await prisma.transaction.update({
    where: { id: scheduled.id },
    data: { date: yesterday },
  });
  return scheduled.id;
}

/** Remove ocorrências geradas para forçar o job de recorrência a recriar. */
export async function wipeRecurringOccurrences(recurringId: string): Promise<number> {
  const prisma = await db();
  const result = await prisma.transaction.deleteMany({
    where: { recurringTransactionId: recurringId },
  });
  return result.count;
}

export async function countRecurringOccurrences(recurringId: string): Promise<number> {
  const prisma = await db();
  return prisma.transaction.count({ where: { recurringTransactionId: recurringId } });
}

export async function getPostingStatus(transactionId: string): Promise<string | null> {
  const prisma = await db();
  const row = await prisma.transaction.findUnique({
    where: { id: transactionId },
    select: { postingStatus: true },
  });
  return row?.postingStatus ?? null;
}

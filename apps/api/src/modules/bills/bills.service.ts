import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccountType, BillStatus, Prisma, TransactionType } from '@orcadom/database';
import type {
  CreateBillDto,
  LinkBillTransactionDto,
  ListBillsQuery,
  PayBillDto,
  UpdateBillDto,
} from '@orcadom/types';
import { getAccessibleAccountIds } from '../../common/account-access.js';
import {
  addDaysKey,
  dateKeyFromIso,
  noonUtcFromKey,
  todayKeyInSaoPaulo,
  utcDateKey,
} from '../../common/calendar.js';
import { moneyString, toDecimal } from '../../common/money.js';
import { PrismaService } from '../../common/prisma.service.js';
import { BILL_AMOUNT_TOLERANCE, BILL_MATCH_WIDE } from '../imports/match-import-rows.js';
import { billDisplay } from './bill-display.js';
import { TransactionsService, type PendingDomainEvent } from '../transactions/transactions.service.js';

const BILL_MATCH_CANDIDATE_LIMIT = 5;

@Injectable()
export class BillsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionsService,
  ) {}

  async create(householdId: string, householdMemberId: string, dto: CreateBillDto) {
    await this.assertAccounts(householdId, householdMemberId, [dto.accountId, dto.targetAccountId]);
    await this.assertCategory(householdId, dto.categoryId, dto.targetAccountId);
    if (dto.targetAccountId) await this.assertCard(householdId, dto.targetAccountId);
    const created = await this.prisma.client.bill.create({
      data: {
        householdId,
        description: dto.description,
        amount: toDecimal(dto.amount),
        dueDate: noonUtcFromKey(dto.dueDate),
        accountId: dto.accountId ?? null,
        categoryId: dto.targetAccountId ? null : (dto.categoryId ?? null),
        targetAccountId: dto.targetAccountId ?? null,
        notes: dto.notes ?? null,
      },
    });
    return this.get(householdId, householdMemberId, created.id);
  }

  async list(householdId: string, householdMemberId: string, query: ListBillsQuery) {
    const ids = await this.accessibleIds(householdId, householdMemberId);
    const monthMatch = /^(\d{4})-(\d{2})$/.exec(query.month);
    if (!monthMatch) throw new BadRequestException('Mês inválido.');
    const year = Number(monthMatch[1]);
    const month = Number(monthMatch[2]);
    const monthStart = `${query.month}-01`;
    const monthEnd = utcDateKey(new Date(Date.UTC(year, month, 0)));
    const today = todayKeyInSaoPaulo();
    const where: Prisma.BillWhereInput = {
      ...this.visibleWhere(householdId, ids),
      OR: [
        { dueDate: { gte: noonUtcFromKey(monthStart), lte: noonUtcFromKey(monthEnd) } },
        ...(query.includeOverdue
          ? [{ status: BillStatus.PENDING, dueDate: { lt: noonUtcFromKey(today) } }]
          : []),
      ],
      ...(query.includeCanceled ? {} : { status: { not: BillStatus.CANCELED } }),
    };
    const rows = await this.prisma.client.bill.findMany({
      where,
      include: this.billInclude(),
      orderBy: [{ dueDate: 'asc' }, { description: 'asc' }],
    });
    return rows.map((row) => this.toResponse(row, today));
  }

  async summary(householdId: string, householdMemberId: string, month: string) {
    const items = await this.list(householdId, householdMemberId, {
      month,
      includeOverdue: true,
      includeCanceled: false,
    });
    const paid = items.filter((item) => item.status === 'PAID');
    const pending = items.filter((item) => item.status === 'PENDING' && item.display.tone !== 'expense');
    const overdue = items.filter((item) => item.display.label === 'Atrasada');
    const sum = (rows: { amount: string }[]) =>
      rows.reduce((total, row) => total + Number(row.amount), 0);
    return {
      month,
      paidCount: paid.length,
      pendingCount: items.filter((item) => item.status === 'PENDING').length,
      overdueCount: overdue.length,
      totalCount: items.length,
      pendingAmount: sum(pending).toFixed(2),
      overdueAmount: sum(overdue).toFixed(2),
      remainingAmount: sum(items.filter((item) => item.status === 'PENDING')).toFixed(2),
    };
  }

  async get(householdId: string, householdMemberId: string, id: string) {
    const row = await this.findVisible(householdId, householdMemberId, id);
    return this.toResponse(row, todayKeyInSaoPaulo());
  }

  async update(householdId: string, householdMemberId: string, id: string, dto: UpdateBillDto) {
    const current = await this.findVisible(householdId, householdMemberId, id);
    if (current.status === BillStatus.PAID) {
      const keys = Object.keys(dto).filter((key) => dto[key as keyof UpdateBillDto] !== undefined);
      if (keys.some((key) => key !== 'notes')) {
        throw new ConflictException('Conta paga só aceita observação. O restante se edita no lançamento.');
      }
    } else if (current.status !== BillStatus.PENDING) {
      throw new ConflictException('Conta não está pendente.');
    }
    const targetAccountId =
      dto.targetAccountId === undefined ? current.targetAccountId : dto.targetAccountId;
    const accountId = dto.accountId === undefined ? current.accountId : dto.accountId;
    if (targetAccountId && targetAccountId === accountId) {
      throw new BadRequestException('A conta do cartão deve ser diferente da conta que paga.');
    }
    await this.assertAccounts(householdId, householdMemberId, [
      dto.accountId ?? undefined,
      dto.targetAccountId ?? undefined,
    ]);
    if (targetAccountId) await this.assertCard(householdId, targetAccountId);
    if (current.status === BillStatus.PENDING) {
      await this.assertCategory(
        householdId,
        dto.categoryId === undefined ? (current.categoryId ?? undefined) : (dto.categoryId ?? undefined),
        targetAccountId ?? undefined,
      );
    }
    await this.prisma.client.bill.update({
      where: { id: current.id },
      data: {
        ...(dto.description !== undefined ? { description: dto.description } : {}),
        ...(dto.amount !== undefined ? { amount: toDecimal(dto.amount) } : {}),
        ...(dto.dueDate !== undefined ? { dueDate: noonUtcFromKey(dto.dueDate) } : {}),
        ...(dto.accountId !== undefined ? { accountId: dto.accountId } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes } : {}),
        ...(dto.targetAccountId !== undefined ? { targetAccountId: dto.targetAccountId } : {}),
        ...(targetAccountId
          ? { categoryId: null }
          : dto.categoryId !== undefined
            ? { categoryId: dto.categoryId }
            : {}),
      },
    });
    return this.get(householdId, householdMemberId, id);
  }

  async pay(householdId: string, householdMemberId: string, userId: string, id: string, dto: PayBillDto) {
    const today = todayKeyInSaoPaulo();
    const dateKey = dto.date ? dateKeyFromIso(dto.date) : today;
    if (dateKey > today) {
      throw new BadRequestException('A data do pagamento não pode ser futura.');
    }
    const result = await this.prisma.client.$transaction(async (raw) => {
      const tx = raw as Prisma.TransactionClient;
      await this.lockBill(tx, id, householdId);
      const bill = await tx.bill.findFirst({ where: { id, householdId } });
      if (!bill) throw new NotFoundException('Conta a pagar não encontrada.');
      await this.assertVisible(householdId, householdMemberId, bill);
      if (bill.status !== BillStatus.PENDING) {
        throw new ConflictException('Conta não está pendente.');
      }
      const accountId = dto.accountId;
      await this.assertAccounts(householdId, householdMemberId, [accountId, bill.targetAccountId ?? undefined]);
      const categoryId = bill.targetAccountId ? undefined : (dto.categoryId ?? bill.categoryId ?? undefined);
      if (!bill.targetAccountId) await this.assertCategory(householdId, categoryId, undefined);
      const input = bill.targetAccountId
        ? {
            description: bill.description,
            amount: dto.amount ?? Number(bill.amount),
            type: 'TRANSFER' as const,
            date: noonUtcFromKey(dateKey).toISOString(),
            fromAccountId: accountId,
            toAccountId: bill.targetAccountId,
          }
        : {
            description: bill.description,
            amount: dto.amount ?? Number(bill.amount),
            type: 'EXPENSE' as const,
            date: noonUtcFromKey(dateKey).toISOString(),
            accountId,
            categoryId,
          };
      const created = await this.transactions.createWithin(tx, householdId, userId, input);
      await tx.bill.update({
        where: { id: bill.id },
        data: {
          status: BillStatus.PAID,
          transactionId: created.transaction.id,
          settlement: 'GENERATED',
        },
      });
      return { billId: bill.id, transactionId: created.transaction.id, events: created.events };
    });
    await this.transactions.flushEvents(result.events);
    return { billId: result.billId, transactionId: result.transactionId };
  }

  async unpay(householdId: string, householdMemberId: string, id: string) {
    const result = await this.prisma.client.$transaction(async (raw) => {
      const tx = raw as Prisma.TransactionClient;
      await this.lockBill(tx, id, householdId);
      const bill = await tx.bill.findFirst({
        where: { id, householdId },
        include: { transaction: true },
      });
      if (!bill) throw new NotFoundException('Conta a pagar não encontrada.');
      await this.assertVisible(householdId, householdMemberId, bill);
      if (bill.status !== BillStatus.PAID || !bill.transaction || !bill.settlement) {
        throw new ConflictException('Conta não está paga.');
      }
      if (bill.settlement === 'LINKED') {
        await tx.bill.update({
          where: { id: bill.id },
          data: { status: BillStatus.PENDING, transactionId: null, settlement: null },
        });
        return { events: [] as PendingDomainEvent[] };
      }
      return this.transactions.deleteWithin(tx, bill.transaction);
    });
    await this.transactions.flushEvents(result.events);
  }

  async cancel(householdId: string, householdMemberId: string, id: string) {
    const current = await this.findVisible(householdId, householdMemberId, id);
    if (current.status !== BillStatus.PENDING) throw new ConflictException('Conta não está pendente.');
    await this.prisma.client.bill.update({
      where: { id: current.id },
      data: { status: BillStatus.CANCELED },
    });
    return this.get(householdId, householdMemberId, id);
  }

  async reopen(householdId: string, householdMemberId: string, id: string) {
    const current = await this.findVisible(householdId, householdMemberId, id);
    if (current.status !== BillStatus.CANCELED) throw new ConflictException('Conta não está cancelada.');
    await this.prisma.client.bill.update({
      where: { id: current.id },
      data: { status: BillStatus.PENDING },
    });
    return this.get(householdId, householdMemberId, id);
  }

  async remove(householdId: string, householdMemberId: string, id: string): Promise<void> {
    const current = await this.findVisible(householdId, householdMemberId, id);
    if (current.status !== BillStatus.PENDING) throw new ConflictException('Só uma conta pendente pode ser excluída.');
    if (current.recurringTransactionId) {
      await this.prisma.client.bill.update({
        where: { id: current.id },
        data: { status: BillStatus.CANCELED },
      });
      return;
    }
    await this.prisma.client.bill.delete({ where: { id: current.id } });
  }

  async matchCandidates(householdId: string, householdMemberId: string, id: string) {
    const bill = await this.findVisible(householdId, householdMemberId, id);
    if (bill.status !== BillStatus.PENDING) return [];
    const ids = await this.accessibleIds(householdId, householdMemberId);
    const due = utcDateKey(bill.dueDate);
    const from = noonUtcFromKey(addDaysKey(due, -BILL_MATCH_WIDE.before));
    const to = noonUtcFromKey(addDaysKey(due, BILL_MATCH_WIDE.after));
    const rows = await this.prisma.client.transaction.findMany({
      where: {
        householdId,
        postingStatus: 'POSTED',
        bill: null,
        date: { gte: from, lte: to },
        ...(bill.targetAccountId
          ? { type: TransactionType.TRANSFER, toAccountId: bill.targetAccountId, fromAccountId: { in: ids } }
          : { type: TransactionType.EXPENSE, accountId: { in: ids } }),
      },
      orderBy: { date: 'asc' },
    });
    return rows
      .map((row) => {
        const amount = Number(row.amount);
        const expected = Number(bill.amount);
        const exact = amount === expected;
        const close = expected === 0 ? exact : Math.abs(amount - expected) / expected <= BILL_AMOUNT_TOLERANCE;
        if (!exact && !close) return null;
        return {
          transactionId: row.id,
          description: row.description,
          amount: moneyString(row.amount),
          date: row.date.toISOString(),
          source: row.source,
          matchConfidence: exact ? ('high' as const) : ('low' as const),
          distance: Math.abs(
            Date.parse(utcDateKey(row.date)) - Date.parse(due),
          ),
        };
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, BILL_MATCH_CANDIDATE_LIMIT)
      .map(({ distance: _distance, ...row }) => row);
  }

  async linkTransaction(
    householdId: string,
    householdMemberId: string,
    id: string,
    dto: LinkBillTransactionDto,
  ) {
    const candidates = await this.matchCandidates(householdId, householdMemberId, id);
    if (!candidates.some((candidate) => candidate.transactionId === dto.transactionId)) {
      throw new ConflictException('Este lançamento não corresponde a esta conta.');
    }
    await this.prisma.client.$transaction(async (raw) => {
      const tx = raw as Prisma.TransactionClient;
      await this.lockBill(tx, id, householdId);
      await tx.$queryRaw`SELECT id FROM transactions WHERE id = ${dto.transactionId} AND "householdId" = ${householdId} FOR UPDATE`;
      const bill = await tx.bill.findFirst({ where: { id, householdId } });
      if (bill?.status !== BillStatus.PENDING) {
        throw new ConflictException('Conta não está pendente.');
      }
      const linked = await tx.bill.findFirst({ where: { transactionId: dto.transactionId } });
      if (linked) throw new ConflictException('Este lançamento já está ligado a uma conta.');
      await tx.bill.update({
        where: { id: bill.id },
        data: { status: BillStatus.PAID, transactionId: dto.transactionId, settlement: 'LINKED' },
      });
    });
    return this.get(householdId, householdMemberId, id);
  }

  private async lockBill(tx: Prisma.TransactionClient, billId: string, householdId: string) {
    await tx.$queryRaw`SELECT id FROM bills WHERE id = ${billId} AND "householdId" = ${householdId} FOR UPDATE`;
  }

  private async accessibleIds(householdId: string, householdMemberId: string) {
    return getAccessibleAccountIds(this.prisma.client, householdId, householdMemberId);
  }

  private visibleWhere(householdId: string, ids: string[]): Prisma.BillWhereInput {
    return {
      householdId,
      AND: [
        { OR: [{ accountId: null }, { accountId: { in: ids } }] },
        { OR: [{ targetAccountId: null }, { targetAccountId: { in: ids } }] },
      ],
    };
  }

  private async findVisible(householdId: string, householdMemberId: string, id: string) {
    const ids = await this.accessibleIds(householdId, householdMemberId);
    const row = await this.prisma.client.bill.findFirst({
      where: { id, ...this.visibleWhere(householdId, ids) },
      include: this.billInclude(),
    });
    if (!row) throw new NotFoundException('Conta a pagar não encontrada.');
    return row;
  }

  private async assertVisible(
    householdId: string,
    householdMemberId: string,
    bill: { accountId: string | null; targetAccountId: string | null },
  ) {
    const ids = new Set(await this.accessibleIds(householdId, householdMemberId));
    const accountOk = bill.accountId === null || ids.has(bill.accountId);
    const targetOk = bill.targetAccountId === null || ids.has(bill.targetAccountId);
    if (!accountOk || !targetOk) throw new NotFoundException('Conta a pagar não encontrada.');
  }

  private async assertAccounts(
    householdId: string,
    householdMemberId: string,
    accountIds: (string | null | undefined)[],
  ) {
    const ids = await this.accessibleIds(householdId, householdMemberId);
    const visible = new Set(ids);
    for (const id of accountIds) {
      if (!id) continue;
      const account = await this.prisma.client.account.findFirst({ where: { id, householdId } });
      if (!account || !visible.has(id)) throw new NotFoundException('Conta não encontrada.');
    }
  }

  private async assertCard(householdId: string, accountId: string) {
    const account = await this.prisma.client.account.findFirst({ where: { id: accountId, householdId } });
    if (account?.type !== AccountType.CREDIT_CARD) {
      throw new BadRequestException('A fatura precisa apontar para uma conta de cartão.');
    }
  }

  private async assertCategory(
    householdId: string,
    categoryId: string | null | undefined,
    targetAccountId: string | null | undefined,
  ) {
    if (targetAccountId) return;
    if (!categoryId) throw new BadRequestException('Categoria é obrigatória.');
    const category = await this.prisma.client.category.findFirst({ where: { id: categoryId, householdId } });
    if (!category) throw new NotFoundException('Categoria não encontrada.');
    if (category.type !== 'EXPENSE') {
      throw new BadRequestException('A categoria não corresponde a uma despesa.');
    }
  }

  private billInclude() {
    return {
      account: { select: { name: true } },
      category: { select: { name: true, color: true } },
      targetAccount: { select: { name: true } },
      transaction: { select: { id: true, amount: true, date: true, source: true, description: true } },
    } as const;
  }

  private toResponse(
    row: {
      id: string;
      description: string;
      amount: { toFixed(digits: number): string };
      dueDate: Date;
      status: string;
      notes: string | null;
      accountId: string | null;
      categoryId: string | null;
      targetAccountId: string | null;
      recurringTransactionId: string | null;
      settlement: string | null;
      account: { name: string } | null;
      category: { name: string; color: string | null } | null;
      targetAccount: { name: string } | null;
      transaction: {
        id: string;
        amount: { toFixed(digits: number): string };
        date: Date;
        source: string;
        description: string;
      } | null;
    },
    today: string,
  ) {
    const dueKey = utcDateKey(row.dueDate);
    return {
      id: row.id,
      description: row.description,
      amount: moneyString(row.amount),
      dueDate: dueKey,
      status: row.status,
      settlement: row.settlement,
      notes: row.notes,
      accountId: row.accountId,
      accountName: row.account?.name ?? null,
      categoryId: row.categoryId,
      categoryName: row.category?.name ?? null,
      categoryColor: row.category?.color ?? null,
      targetAccountId: row.targetAccountId,
      targetAccountName: row.targetAccount?.name ?? null,
      recurringTransactionId: row.recurringTransactionId,
      display: billDisplay(row.status as 'PENDING' | 'PAID' | 'CANCELED', dueKey, today),
      payment: row.transaction
        ? {
            transactionId: row.transaction.id,
            amount: moneyString(row.transaction.amount),
            date: row.transaction.date.toISOString(),
            source: row.transaction.source,
            description: row.transaction.description,
          }
        : null,
    };
  }
}

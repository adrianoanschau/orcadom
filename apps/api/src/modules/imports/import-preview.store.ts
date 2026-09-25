import { Injectable } from '@nestjs/common';
import type { ParsedStatementRow } from './parsers/shared.js';

export interface StoredImportRow extends ParsedStatementRow {
  lineId: string;
  isDuplicate: boolean;
}

export interface StoredImportPreview {
  householdId: string;
  accountId: string | null;
  fileName: string;
  format: 'OFX' | 'CSV';
  bankId: string | null;
  acctId: string | null;
  rows: StoredImportRow[];
}

export interface SerializedImportRow {
  lineId: string;
  date: string;
  description: string;
  amount: number;
  type: 'INCOME' | 'EXPENSE';
  externalId: string;
  isDuplicate: boolean;
}

@Injectable()
export class ImportPreviewStore {
  private readonly ttlMs = 7 * 24 * 60 * 60 * 1000;
  private readonly store = new Map<string, { expiresAt: number; payload: StoredImportPreview }>();

  set(batchId: string, payload: StoredImportPreview): void {
    this.store.set(batchId, { payload, expiresAt: Date.now() + this.ttlMs });
  }

  get(batchId: string): StoredImportPreview | null {
    const entry = this.store.get(batchId);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      this.store.delete(batchId);
      return null;
    }
    return entry.payload;
  }

  delete(batchId: string): void {
    this.store.delete(batchId);
  }
}

export function serializePreviewRows(rows: StoredImportRow[]): SerializedImportRow[] {
  return rows.map((row) => ({
    lineId: row.lineId,
    date: row.date.toISOString(),
    description: row.description,
    amount: row.amount,
    type: row.type,
    externalId: row.externalId,
    isDuplicate: row.isDuplicate,
  }));
}

export function hydratePreviewRows(rows: SerializedImportRow[]): StoredImportRow[] {
  return rows.map((row) => ({
    ...row,
    date: new Date(row.date),
  }));
}

import { Injectable } from '@nestjs/common';
import type { ParsedStatementRow } from './parsers/shared.js';

export interface StoredImportRow extends ParsedStatementRow {
  lineId: string;
  isDuplicate: boolean;
}

export interface StoredImportPreview {
  userId: string;
  accountId: string;
  fileName: string;
  format: 'OFX' | 'CSV';
  rows: StoredImportRow[];
}

@Injectable()
export class ImportPreviewStore {
  private readonly ttlMs = 60 * 60 * 1000;
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

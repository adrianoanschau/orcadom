import { createReadStream } from 'node:fs';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { Readable } from 'node:stream';
import type { ReportFormat } from '@orcadom/types';

export interface ReportStorage {
  write(id: string, format: ReportFormat, buffer: Buffer): Promise<string>;
  read(filePath: string): Promise<Readable>;
  delete(filePath: string): Promise<void>;
}

export class LocalReportStorage implements ReportStorage {
  constructor(private readonly root: string) {}

  async write(id: string, format: ReportFormat, buffer: Buffer): Promise<string> {
    await mkdir(this.root, { recursive: true });
    const fileName = `${id}.${format === 'PDF' ? 'pdf' : 'xlsx'}`;
    await writeFile(this.resolvePath(fileName), buffer);
    return fileName;
  }

  read(filePath: string): Promise<Readable> {
    return Promise.resolve(createReadStream(this.resolvePath(filePath)));
  }

  async delete(filePath: string): Promise<void> {
    try {
      await unlink(this.resolvePath(filePath));
    } catch (error) {
      if (isEnoent(error)) return;
      throw error;
    }
  }

  private resolvePath(filePath: string): string {
    const root = resolve(this.root);
    const full = resolve(root, filePath);
    if (!full.startsWith(`${root}/`) && full !== root) {
      throw new Error('Caminho de relatório inválido.');
    }
    return full;
  }
}

export function defaultReportsDir(configured?: string): string {
  return configured && configured.trim().length > 0 ? configured : join(process.cwd(), 'data', 'reports');
}

function isEnoent(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT');
}

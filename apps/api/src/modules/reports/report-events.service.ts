import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import type { ReportFormat } from '@orcadom/types';

export const REPORT_READY = 'report.ready';

export interface ReportReadyPayload {
  householdId: string;
  reportId: string;
  requestedByUserId: string;
  format: ReportFormat;
}

@Injectable()
export class ReportEventsService {
  constructor(private readonly events: EventEmitter2) {}

  emitReady(payload: ReportReadyPayload): void {
    this.events.emit(REPORT_READY, payload);
  }
}

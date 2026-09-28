import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { runWithActor, type ActorStore } from '@orcadom/database';
import { randomUUID } from 'node:crypto';
import { Observable } from 'rxjs';
import { resolveRequestId } from '../observability/request-id.js';

@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      id?: string;
      user?: { userId?: string };
      household?: { id?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();
    const response = context
      .switchToHttp()
      .getResponse<{ setHeader: (name: string, value: string) => void }>();
    const apiKey = request.headers['x-orcadom-api-key'];
    const requestId = resolveRequestId(request.headers['x-request-id'] ?? request.id, randomUUID());
    request.id = requestId;
    response.setHeader('x-request-id', requestId);

    const store: ActorStore = {
      userId: request.user?.userId ?? null,
      householdId: request.household?.id ?? null,
      source: apiKey ? 'AUTOMATION_EMAIL' : 'USER',
      requestId,
    };

    return new Observable((subscriber) => {
      runWithActor(store, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}

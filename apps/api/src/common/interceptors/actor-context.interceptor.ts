import { Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { runWithActor, type ActorStore } from '@orcadom/database';
import { Observable } from 'rxjs';

@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      user?: { userId?: string };
      household?: { id?: string };
      headers: Record<string, string | string[] | undefined>;
    }>();
    const apiKey = request.headers['x-orcadom-api-key'];
    const store: ActorStore = {
      userId: request.user?.userId ?? null,
      householdId: request.household?.id ?? null,
      source: apiKey ? 'AUTOMATION_EMAIL' : 'USER',
    };

    return new Observable((subscriber) => {
      runWithActor(store, () => {
        next.handle().subscribe(subscriber);
      });
    });
  }
}

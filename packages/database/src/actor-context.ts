import { AsyncLocalStorage } from 'node:async_hooks';
import type { AuditSource } from './generated/prisma/client.js';

export interface ActorStore {
  userId: string | null;
  householdId: string | null;
  source: AuditSource;
}

export const actorContext = new AsyncLocalStorage<ActorStore>();

export function runWithActor<T>(store: ActorStore, fn: () => T): T {
  return actorContext.run(store, fn);
}

export function getActor(): ActorStore {
  return actorContext.getStore() ?? { userId: null, householdId: null, source: 'SYSTEM' };
}

import { z } from 'zod';

export const notificationChannelSchema = z.enum(['IN_APP', 'EMAIL', 'WEB_PUSH']);

export const pushSubscriptionSchema = z.object({
  endpoint: z.url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

export const deletePushSubscriptionSchema = z.object({
  endpoint: z.url(),
});

export type NotificationChannel = z.infer<typeof notificationChannelSchema>;
export type PushSubscriptionDto = z.infer<typeof pushSubscriptionSchema>;
export type DeletePushSubscriptionDto = z.infer<typeof deletePushSubscriptionSchema>;

export function notificationPath(
  type: string,
  metadata?: { importBatchId?: string; goalId?: string; reportId?: string } | null,
): string {
  if (type === 'EMAIL_IMPORT_READY' || type === 'EMAIL_IMPORT_UNMAPPED_ACCOUNT') {
    return metadata?.importBatchId ? `/imports?batchId=${metadata.importBatchId}` : '/imports';
  }
  if (type === 'SAVINGS_GOAL_COMPLETED') {
    return metadata?.goalId ? `/savings-goals/${metadata.goalId}` : '/savings-goals';
  }
  if (type === 'REPORT_READY') {
    return metadata?.reportId ? `/transactions?reportId=${metadata.reportId}` : '/transactions';
  }
  return '/budgets';
}

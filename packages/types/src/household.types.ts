import { z } from 'zod';

export const householdRoleSchema = z.enum(['OWNER', 'MEMBER']);
export const inviteStatusSchema = z.enum(['PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED']);

export const createHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(1).max(80),
});

export const createHouseholdInviteSchema = z.object({
  email: z.string().trim().email().max(160),
  role: householdRoleSchema.optional(),
});

export type CreateHouseholdDto = z.infer<typeof createHouseholdSchema>;
export type UpdateHouseholdDto = z.infer<typeof updateHouseholdSchema>;
export type CreateHouseholdInviteDto = z.infer<typeof createHouseholdInviteSchema>;
export type HouseholdRole = z.infer<typeof householdRoleSchema>;
export type InviteStatus = z.infer<typeof inviteStatusSchema>;

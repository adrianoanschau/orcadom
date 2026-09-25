import {
  createHouseholdInviteSchema,
  createHouseholdSchema,
  idParamSchema,
  updateHouseholdSchema,
} from '@orcadom/types';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

export class CreateHouseholdBody extends createZodDto(createHouseholdSchema) {}
export class UpdateHouseholdBody extends createZodDto(updateHouseholdSchema) {}
export class CreateHouseholdInviteBody extends createZodDto(createHouseholdInviteSchema) {}
export class HouseholdParams extends createZodDto(idParamSchema) {}
export class HouseholdMemberParams extends createZodDto(
  idParamSchema.extend({ userId: z.uuid() }),
) {}
export class InviteTokenParams extends createZodDto(z.object({ token: z.string().min(8).max(80) })) {}

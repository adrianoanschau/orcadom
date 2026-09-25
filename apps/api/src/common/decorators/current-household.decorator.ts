import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { HouseholdRole } from '@orcadom/types';

export interface RequestHousehold {
  id: string;
  role: HouseholdRole;
}

export const CurrentHousehold = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<{ household: RequestHousehold }>();
  return request.household.id;
});

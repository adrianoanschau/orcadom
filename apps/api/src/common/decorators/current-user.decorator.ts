import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator((_: unknown, context: ExecutionContext): string => {
  const request = context.switchToHttp().getRequest<{ user: { userId: string } }>();
  return request.user.userId;
});

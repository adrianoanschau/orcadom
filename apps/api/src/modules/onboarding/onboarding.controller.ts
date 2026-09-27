import { Controller, Get, HttpCode, HttpStatus, Patch } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { OnboardingService } from './onboarding.service.js';

@ApiTags('onboarding')
@ApiCookieAuth('accessToken')
@Controller('onboarding')
export class OnboardingController {
  constructor(private readonly onboarding: OnboardingService) {}

  @Get('status')
  status(@CurrentUser() userId: string, @CurrentHousehold() householdId: string) {
    return this.onboarding.status(userId, householdId);
  }

  @Patch('dismiss')
  @HttpCode(HttpStatus.OK)
  dismiss(@CurrentUser() userId: string, @CurrentHousehold() householdId: string) {
    return this.onboarding.dismiss(userId, householdId);
  }

  @Patch('resume')
  @HttpCode(HttpStatus.OK)
  resume(@CurrentUser() userId: string, @CurrentHousehold() householdId: string) {
    return this.onboarding.resume(userId, householdId);
  }
}

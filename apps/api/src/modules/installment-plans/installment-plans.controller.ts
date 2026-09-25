import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CreateInstallmentPlanBody, InstallmentPlanParams } from './installment-plans.dto.js';
import { InstallmentPlansService } from './installment-plans.service.js';

@ApiTags('installment-plans')
@ApiCookieAuth('accessToken')
@Controller('installment-plans')
export class InstallmentPlansController {
  constructor(private readonly plans: InstallmentPlansService) {}

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @CurrentUser() userId: string,
    @Body() body: CreateInstallmentPlanBody,
  ) {
    return this.plans.create(householdId, userId, body);
  }

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.plans.list(householdId);
  }

  @Get(':id')
  get(@CurrentHousehold() householdId: string, @Param() params: InstallmentPlanParams) {
    return this.plans.get(householdId, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentHousehold() householdId: string,
    @Param() params: InstallmentPlanParams,
  ): Promise<void> {
    return this.plans.remove(householdId, params.id);
  }
}

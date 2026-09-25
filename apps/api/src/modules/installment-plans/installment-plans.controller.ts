import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { CreateInstallmentPlanBody, InstallmentPlanParams } from './installment-plans.dto.js';
import { InstallmentPlansService } from './installment-plans.service.js';

@ApiTags('installment-plans')
@ApiCookieAuth('accessToken')
@Controller('installment-plans')
export class InstallmentPlansController {
  constructor(private readonly plans: InstallmentPlansService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateInstallmentPlanBody) {
    return this.plans.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string) {
    return this.plans.list(userId);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param() params: InstallmentPlanParams) {
    return this.plans.get(userId, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: InstallmentPlanParams): Promise<void> {
    return this.plans.remove(userId, params.id);
  }
}

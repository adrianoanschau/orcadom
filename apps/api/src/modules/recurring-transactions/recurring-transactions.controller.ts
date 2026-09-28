import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentHousehold,
  CurrentHouseholdMember,
} from '../../common/decorators/current-household.decorator.js';
import {
  CreateRecurringTransactionBody,
  RecurringTransactionParams,
  UpdateRecurringTransactionBody,
} from './recurring-transactions.dto.js';
import { RecurringTransactionsService } from './recurring-transactions.service.js';

@ApiTags('recurring-transactions')
@ApiCookieAuth('accessToken')
@Controller('recurring-transactions')
export class RecurringTransactionsController {
  constructor(private readonly recurring: RecurringTransactionsService) {}

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Body() body: CreateRecurringTransactionBody,
  ) {
    return this.recurring.create(householdId, householdMemberId, body);
  }

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
  ) {
    return this.recurring.list(householdId, householdMemberId);
  }

  @Patch(':id/pause')
  pause(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: RecurringTransactionParams,
  ) {
    return this.recurring.pause(householdId, householdMemberId, params.id);
  }

  @Patch(':id/resume')
  resume(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: RecurringTransactionParams,
  ) {
    return this.recurring.resume(householdId, householdMemberId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: RecurringTransactionParams,
    @Body() body: UpdateRecurringTransactionBody,
  ) {
    return this.recurring.update(householdId, householdMemberId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: RecurringTransactionParams,
  ): Promise<void> {
    return this.recurring.remove(householdId, householdMemberId, params.id);
  }
}

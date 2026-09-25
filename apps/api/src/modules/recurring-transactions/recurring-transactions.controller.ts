import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
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
  create(@CurrentUser() userId: string, @Body() body: CreateRecurringTransactionBody) {
    return this.recurring.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string) {
    return this.recurring.list(userId);
  }

  @Patch(':id/pause')
  pause(@CurrentUser() userId: string, @Param() params: RecurringTransactionParams) {
    return this.recurring.pause(userId, params.id);
  }

  @Patch(':id/resume')
  resume(@CurrentUser() userId: string, @Param() params: RecurringTransactionParams) {
    return this.recurring.resume(userId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param() params: RecurringTransactionParams,
    @Body() body: UpdateRecurringTransactionBody,
  ) {
    return this.recurring.update(userId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: RecurringTransactionParams): Promise<void> {
    return this.recurring.remove(userId, params.id);
  }
}

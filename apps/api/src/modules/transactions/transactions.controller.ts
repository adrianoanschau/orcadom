import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentHousehold,
  CurrentHouseholdMember,
} from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  CreateTransactionBody,
  ListTransactionsQueryDto,
  TransactionParams,
  UpdateTransactionBody,
} from './transactions.dto.js';
import { TransactionsService } from './transactions.service.js';

@ApiTags('transactions')
@ApiCookieAuth('accessToken')
@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @CurrentUser() userId: string,
    @Body() body: CreateTransactionBody,
  ) {
    return this.transactions.create(householdId, householdMemberId, userId, body);
  }

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactions.list(householdId, householdMemberId, query);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: TransactionParams,
    @Body() body: UpdateTransactionBody,
  ) {
    return this.transactions.update(householdId, householdMemberId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: TransactionParams,
  ): Promise<void> {
    return this.transactions.remove(householdId, householdMemberId, params.id);
  }
}

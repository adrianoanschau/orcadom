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
  create(@CurrentUser() userId: string, @Body() body: CreateTransactionBody) {
    return this.transactions.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string, @Query() query: ListTransactionsQueryDto) {
    return this.transactions.list(userId, query);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param() params: TransactionParams,
    @Body() body: UpdateTransactionBody,
  ) {
    return this.transactions.update(userId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: TransactionParams): Promise<void> {
    return this.transactions.remove(userId, params.id);
  }
}

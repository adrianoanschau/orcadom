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
import { BudgetParams, CreateBudgetBody, ListBudgetsQueryDto, UpdateBudgetBody } from './budgets.dto.js';
import { BudgetsService } from './budgets.service.js';

@ApiTags('budgets')
@ApiCookieAuth('accessToken')
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateBudgetBody) {
    return this.budgets.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string, @Query() query: ListBudgetsQueryDto) {
    return this.budgets.list(userId, query.month);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param() params: BudgetParams,
    @Body() body: UpdateBudgetBody,
  ) {
    return this.budgets.update(userId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: BudgetParams): Promise<void> {
    return this.budgets.remove(userId, params.id);
  }
}

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
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { BudgetParams, CreateBudgetBody, ListBudgetsQueryDto, UpdateBudgetBody } from './budgets.dto.js';
import { BudgetsService } from './budgets.service.js';

@ApiTags('budgets')
@ApiCookieAuth('accessToken')
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  create(@CurrentHousehold() householdId: string, @Body() body: CreateBudgetBody) {
    return this.budgets.create(householdId, body);
  }

  @Get()
  list(@CurrentHousehold() householdId: string, @Query() query: ListBudgetsQueryDto) {
    return this.budgets.list(householdId, query.month);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @Param() params: BudgetParams,
    @Body() body: UpdateBudgetBody,
  ) {
    return this.budgets.update(householdId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentHousehold() householdId: string, @Param() params: BudgetParams): Promise<void> {
    return this.budgets.remove(householdId, params.id);
  }
}

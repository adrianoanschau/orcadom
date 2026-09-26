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
} from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import {
  CreateSavingsGoalBody,
  SavingsGoalParams,
  UpdateSavingsGoalBody,
} from './savings-goals.dto.js';
import { SavingsGoalsService } from './savings-goals.service.js';

@ApiTags('savings-goals')
@ApiCookieAuth('accessToken')
@Controller('savings-goals')
export class SavingsGoalsController {
  constructor(private readonly goals: SavingsGoalsService) {}

  @Post()
  create(@CurrentHousehold() householdId: string, @Body() body: CreateSavingsGoalBody) {
    return this.goals.create(householdId, body);
  }

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.goals.list(householdId);
  }

  @Get(':id')
  get(@CurrentHousehold() householdId: string, @Param() params: SavingsGoalParams) {
    return this.goals.get(householdId, params.id);
  }

  @Patch(':id/abandon')
  abandon(@CurrentHousehold() householdId: string, @Param() params: SavingsGoalParams) {
    return this.goals.abandon(householdId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @Param() params: SavingsGoalParams,
    @Body() body: UpdateSavingsGoalBody,
  ) {
    return this.goals.update(householdId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentHousehold() householdId: string, @Param() params: SavingsGoalParams): Promise<void> {
    return this.goals.remove(householdId, params.id);
  }
}

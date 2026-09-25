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
import { AccountParams, CreateAccountBody, UpdateAccountBody } from './accounts.dto.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('accounts')
@ApiCookieAuth('accessToken')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@CurrentHousehold() householdId: string, @Body() body: CreateAccountBody) {
    return this.accounts.create(householdId, body);
  }

  @Get()
  list(@CurrentHousehold() householdId: string) {
    return this.accounts.list(householdId);
  }

  @Get(':id')
  get(@CurrentHousehold() householdId: string, @Param() params: AccountParams) {
    return this.accounts.get(householdId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @Param() params: AccountParams,
    @Body() body: UpdateAccountBody,
  ) {
    return this.accounts.update(householdId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentHousehold() householdId: string, @Param() params: AccountParams): Promise<void> {
    return this.accounts.remove(householdId, params.id);
  }
}

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
import {
  CurrentHousehold,
  CurrentHouseholdMember,
} from '../../common/decorators/current-household.decorator.js';
import {
  AccountParams,
  CreateAccountBody,
  RestrictAccountBody,
  UpdateAccountBody,
} from './accounts.dto.js';
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
  list(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
  ) {
    return this.accounts.list(householdId, householdMemberId);
  }

  @Patch(':id/restrict')
  restrict(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: AccountParams,
    @Body() body: RestrictAccountBody,
  ) {
    return this.accounts.restrict(householdId, householdMemberId, params.id, body);
  }

  @Patch(':id/unrestrict')
  unrestrict(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: AccountParams,
  ) {
    return this.accounts.unrestrict(householdId, householdMemberId, params.id);
  }

  @Get(':id/access')
  access(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: AccountParams,
  ) {
    return this.accounts.listAccess(householdId, householdMemberId, params.id);
  }

  @Get(':id')
  get(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: AccountParams,
  ) {
    return this.accounts.get(householdId, householdMemberId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: AccountParams,
    @Body() body: UpdateAccountBody,
  ) {
    return this.accounts.update(householdId, householdMemberId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: AccountParams,
  ): Promise<void> {
    return this.accounts.remove(householdId, householdMemberId, params.id);
  }
}

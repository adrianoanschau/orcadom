import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import {
  CurrentHousehold,
  CurrentHouseholdMember,
} from '../../common/decorators/current-household.decorator.js';
import {
  BankAccountMappingParams,
  CreateBankAccountMappingBody,
  UpdateBankAccountMappingBody,
} from './bank-account-mappings.dto.js';
import { BankAccountMappingsService } from './bank-account-mappings.service.js';

@ApiTags('bank-account-mappings')
@ApiCookieAuth('accessToken')
@Controller('bank-account-mappings')
export class BankAccountMappingsController {
  constructor(private readonly mappings: BankAccountMappingsService) {}

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
  ) {
    return this.mappings.list(householdId, householdMemberId);
  }

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Body() body: CreateBankAccountMappingBody,
  ) {
    return this.mappings.create(householdId, householdMemberId, body);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BankAccountMappingParams,
    @Body() body: UpdateBankAccountMappingBody,
  ) {
    return this.mappings.update(householdId, householdMemberId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BankAccountMappingParams,
  ): Promise<void> {
    return this.mappings.remove(householdId, householdMemberId, params.id);
  }
}

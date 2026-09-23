import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
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
  list(@CurrentUser() userId: string) {
    return this.mappings.list(userId);
  }

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateBankAccountMappingBody) {
    return this.mappings.create(userId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param() params: BankAccountMappingParams,
    @Body() body: UpdateBankAccountMappingBody,
  ) {
    return this.mappings.update(userId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: BankAccountMappingParams): Promise<void> {
    return this.mappings.remove(userId, params.id);
  }
}

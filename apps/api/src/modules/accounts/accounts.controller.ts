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
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { AccountParams, CreateAccountBody, UpdateAccountBody } from './accounts.dto.js';
import { AccountsService } from './accounts.service.js';

@ApiTags('accounts')
@ApiCookieAuth('accessToken')
@Controller('accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateAccountBody) {
    return this.accounts.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string) {
    return this.accounts.list(userId);
  }

  @Get(':id')
  get(@CurrentUser() userId: string, @Param() params: AccountParams) {
    return this.accounts.get(userId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentUser() userId: string,
    @Param() params: AccountParams,
    @Body() body: UpdateAccountBody,
  ) {
    return this.accounts.update(userId, params.id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() userId: string, @Param() params: AccountParams): Promise<void> {
    return this.accounts.remove(userId, params.id);
  }
}

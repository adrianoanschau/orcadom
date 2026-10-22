import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { MeuPluggyWebhookParams, SaveMeuPluggyCredentialsBody, SyncMeuPluggyBody } from './meupluggy.dto.js';
import { MeuPluggyService } from './meupluggy.service.js';

@Controller('open-finance')
export class MeuPluggyController {
  constructor(private readonly meuPluggy: MeuPluggyService) {}

  @Put('meupluggy/credentials')
  save(
    @CurrentUser() userId: string,
    @CurrentHousehold() householdId: string,
    @Body() body: SaveMeuPluggyCredentialsBody,
  ) {
    return this.meuPluggy.save(userId, householdId, body);
  }

  @Get('meupluggy/status')
  status(@CurrentUser() userId: string, @CurrentHousehold() householdId: string) {
    return this.meuPluggy.status(userId, householdId);
  }

  @Delete('meupluggy/credentials')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentUser() userId: string): Promise<void> {
    await this.meuPluggy.remove(userId);
  }

  @Post('meupluggy/sync')
  sync(
    @CurrentUser() userId: string,
    @CurrentHousehold() householdId: string,
    @Body() body: SyncMeuPluggyBody,
  ) {
    return this.meuPluggy.sync(userId, householdId, body.accounts ?? []);
  }

  @Public()
  @Post('webhooks/meupluggy/:userToken')
  @HttpCode(HttpStatus.ACCEPTED)
  webhook(@Param() params: MeuPluggyWebhookParams, @Req() request: RawBodyRequest<Request>): Promise<void> {
    const raw = request.rawBody?.toString('utf8') ?? '';
    return this.meuPluggy.acceptWebhook(params.userToken, raw);
  }
}

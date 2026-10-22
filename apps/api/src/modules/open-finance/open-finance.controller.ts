import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { ConnectionParams, RegisterConnectionBody, SyncConnectionBody, WebhookParams } from './open-finance.dto.js';
import { OpenFinanceService, webhookHeaders } from './open-finance.service.js';

@Controller('open-finance')
export class OpenFinanceController {
  constructor(private readonly openFinance: OpenFinanceService) {}

  @Post('connect-token')
  connectToken(@CurrentUser() userId: string) {
    return this.openFinance.createConnectToken(userId);
  }

  @Post('connections')
  register(
    @CurrentUser() userId: string,
    @CurrentHousehold() householdId: string,
    @Body() body: RegisterConnectionBody,
  ) {
    return this.openFinance.registerConnection(userId, householdId, body.externalId);
  }

  @Get('connections')
  list(@CurrentUser() userId: string, @CurrentHousehold() householdId: string) {
    return this.openFinance.listConnections(userId, householdId);
  }

  @Post('connections/:id/sync')
  sync(
    @CurrentUser() userId: string,
    @CurrentHousehold() householdId: string,
    @Param() params: ConnectionParams,
    @Body() body: SyncConnectionBody,
  ) {
    return this.openFinance.syncConnection(userId, householdId, params.id, body.accounts ?? []);
  }

  @Delete('connections/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() userId: string,
    @CurrentHousehold() householdId: string,
    @Param() params: ConnectionParams,
  ): Promise<void> {
    await this.openFinance.revokeConnection(userId, householdId, params.id);
  }

  @Public()
  @Post('webhooks/:provider')
  @HttpCode(HttpStatus.ACCEPTED)
  webhook(@Param() params: WebhookParams, @Req() request: RawBodyRequest<Request>): void {
    const raw = request.rawBody?.toString('utf8') ?? '';
    this.openFinance.acceptWebhook(params.provider, webhookHeaders(request.headers), raw);
  }
}

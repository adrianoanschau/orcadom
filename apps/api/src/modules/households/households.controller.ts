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
import { SkipHousehold } from '../../common/decorators/skip-household.decorator.js';
import {
  CreateHouseholdBody,
  CreateHouseholdInviteBody,
  HouseholdMemberParams,
  HouseholdParams,
  InviteTokenParams,
  UpdateHouseholdBody,
} from './households.dto.js';
import { HouseholdsService } from './households.service.js';

@ApiTags('households')
@ApiCookieAuth('accessToken')
@SkipHousehold()
@Controller('households')
export class HouseholdsController {
  constructor(private readonly households: HouseholdsService) {}

  @Post()
  create(@CurrentUser() userId: string, @Body() body: CreateHouseholdBody) {
    return this.households.create(userId, body);
  }

  @Get()
  list(@CurrentUser() userId: string) {
    return this.households.list(userId);
  }

  @Post('invites/:token/accept')
  accept(@CurrentUser() userId: string, @Param() params: InviteTokenParams) {
    return this.households.acceptInvite(userId, params.token);
  }

  @Patch(':id')
  rename(
    @CurrentUser() userId: string,
    @Param() params: HouseholdParams,
    @Body() body: UpdateHouseholdBody,
  ) {
    return this.households.rename(userId, params.id, body);
  }

  @Post(':id/invites')
  invite(
    @CurrentUser() userId: string,
    @Param() params: HouseholdParams,
    @Body() body: CreateHouseholdInviteBody,
  ) {
    return this.households.invite(userId, params.id, body);
  }

  @Get(':id/members')
  members(@CurrentUser() userId: string, @Param() params: HouseholdParams) {
    return this.households.listMembers(userId, params.id);
  }

  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeMember(
    @CurrentUser() actorId: string,
    @Param() params: HouseholdMemberParams,
  ): Promise<void> {
    return this.households.removeMember(actorId, params.id, params.userId);
  }
}

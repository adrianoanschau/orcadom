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
import {
  CurrentHousehold,
  CurrentHouseholdMember,
} from '../../common/decorators/current-household.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import {
  BillParams,
  BillSummaryQueryDto,
  CreateBillBody,
  LinkBillTransactionBody,
  ListBillsQueryDto,
  PayBillBody,
  UpdateBillBody,
} from './bills.dto.js';
import { BillsService } from './bills.service.js';

@ApiTags('bills')
@ApiCookieAuth('accessToken')
@Controller('bills')
export class BillsController {
  constructor(private readonly bills: BillsService) {}

  @Post()
  create(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Body() body: CreateBillBody,
  ) {
    return this.bills.create(householdId, householdMemberId, body);
  }

  @Get()
  list(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Query() query: ListBillsQueryDto,
  ) {
    return this.bills.list(householdId, householdMemberId, query);
  }

  @Get('summary')
  summary(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Query() query: BillSummaryQueryDto,
  ) {
    return this.bills.summary(householdId, householdMemberId, query.month);
  }

  @Get(':id/match-candidates')
  matchCandidates(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
  ) {
    return this.bills.matchCandidates(householdId, householdMemberId, params.id);
  }

  @Get(':id')
  get(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
  ) {
    return this.bills.get(householdId, householdMemberId, params.id);
  }

  @Patch(':id')
  update(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
    @Body() body: UpdateBillBody,
  ) {
    return this.bills.update(householdId, householdMemberId, params.id, body);
  }

  @Post(':id/pay')
  pay(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @CurrentUser() userId: string,
    @Param() params: BillParams,
    @Body() body: PayBillBody,
  ) {
    return this.bills.pay(householdId, householdMemberId, userId, params.id, body);
  }

  @Post(':id/unpay')
  @HttpCode(HttpStatus.NO_CONTENT)
  unpay(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
  ) {
    return this.bills.unpay(householdId, householdMemberId, params.id);
  }

  @Post(':id/link-transaction')
  link(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
    @Body() body: LinkBillTransactionBody,
  ) {
    return this.bills.linkTransaction(householdId, householdMemberId, params.id, body);
  }

  @Patch(':id/cancel')
  cancel(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
  ) {
    return this.bills.cancel(householdId, householdMemberId, params.id);
  }

  @Patch(':id/reopen')
  reopen(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
  ) {
    return this.bills.reopen(householdId, householdMemberId, params.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(
    @CurrentHousehold() householdId: string,
    @CurrentHouseholdMember() householdMemberId: string,
    @Param() params: BillParams,
  ): Promise<void> {
    return this.bills.remove(householdId, householdMemberId, params.id);
  }
}

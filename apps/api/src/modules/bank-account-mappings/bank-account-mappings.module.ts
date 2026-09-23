import { Module } from '@nestjs/common';
import { BankAccountMappingsController } from './bank-account-mappings.controller.js';
import { BankAccountMappingsService } from './bank-account-mappings.service.js';

@Module({
  controllers: [BankAccountMappingsController],
  providers: [BankAccountMappingsService],
})
export class BankAccountMappingsModule {}

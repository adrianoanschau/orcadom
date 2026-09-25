import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentHousehold } from '../../common/decorators/current-household.decorator.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@ApiCookieAuth('accessToken')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('import-alias')
  importAlias(@CurrentHousehold() householdId: string) {
    return this.settings.getImportAlias(householdId);
  }

  @Get('email-import-logs')
  emailImportLogs(@CurrentHousehold() householdId: string) {
    return this.settings.listEmailImportLogs(householdId);
  }
}

import { Controller, Get } from '@nestjs/common';
import { ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { SettingsService } from './settings.service.js';

@ApiTags('settings')
@ApiCookieAuth('accessToken')
@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get('import-alias')
  importAlias(@CurrentUser() userId: string) {
    return this.settings.getImportAlias(userId);
  }

  @Get('email-import-logs')
  emailImportLogs(@CurrentUser() userId: string) {
    return this.settings.listEmailImportLogs(userId);
  }
}

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { Public } from '../../common/decorators/public.decorator.js';
import { AutomationApiKeyGuard } from '../../common/guards/automation-api-key.guard.js';
import {
  THROTTLE_AUTOMATION_LIMIT,
  THROTTLE_TTL_MS,
} from '../../common/throttle/throttle.constants.js';
import { EmailImportBody, EmailImportLogsQuery } from './automation.dto.js';
import { AutomationService } from './automation.service.js';

@ApiTags('automation')
@ApiHeader({ name: 'x-orcadom-api-key', required: true })
@Public()
@Throttle({ default: { limit: THROTTLE_AUTOMATION_LIMIT, ttl: THROTTLE_TTL_MS } })
@UseGuards(AutomationApiKeyGuard)
@Controller('automation')
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  @Post('email-imports')
  @UseInterceptors(
    FileInterceptor('attachment', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  ingest(
    @Body() body: EmailImportBody,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
  ) {
    const attachment = file?.buffer?.length ? file.buffer.toString('base64') : body.attachment;
    if (!attachment) {
      throw new BadRequestException('Envie o anexo OFX.');
    }
    return this.automation.ingestEmail({
      ...body,
      fileName: body.fileName ?? file?.originalname,
      attachment,
    });
  }

  @Get('email-import-logs')
  logs(@Query() query: EmailImportLogsQuery) {
    return this.automation.listLogs(query);
  }
}

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiCookieAuth, ApiTags } from '@nestjs/swagger';
import { memoryStorage } from 'multer';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import { ConfirmImportBody, CreateImportBody, ImportBatchParams } from './imports.dto.js';
import { ImportsService } from './imports.service.js';

@ApiTags('imports')
@ApiCookieAuth('accessToken')
@Controller('imports')
export class ImportsController {
  constructor(private readonly imports: ImportsService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 2 * 1024 * 1024 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['accountId', 'file'],
      properties: {
        accountId: { type: 'string', format: 'uuid' },
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  upload(
    @CurrentUser() userId: string,
    @Body() body: CreateImportBody,
    @UploadedFile() file: { originalname: string; buffer: Buffer } | undefined,
  ) {
    return this.imports.upload(userId, body.accountId, file);
  }

  @Get(':batchId')
  preview(@CurrentUser() userId: string, @Param() params: ImportBatchParams) {
    return this.imports.preview(userId, params.batchId);
  }

  @Post(':batchId/confirm')
  confirm(
    @CurrentUser() userId: string,
    @Param() params: ImportBatchParams,
    @Body() body: ConfirmImportBody,
  ) {
    return this.imports.confirm(userId, params.batchId, body);
  }

  @Delete(':batchId')
  @HttpCode(HttpStatus.NO_CONTENT)
  discard(@CurrentUser() userId: string, @Param() params: ImportBatchParams): Promise<void> {
    return this.imports.discard(userId, params.batchId);
  }
}

import { Global, Module } from '@nestjs/common';
import { CategoryMemoryService } from './category-memory.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, CategoryMemoryService],
  exports: [PrismaService, CategoryMemoryService],
})
export class PrismaModule {}

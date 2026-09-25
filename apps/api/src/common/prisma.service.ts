import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { prisma, type AppPrismaClient } from '@orcadom/database';

@Injectable()
export class PrismaService implements OnModuleDestroy {
  readonly client: AppPrismaClient = prisma;

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}

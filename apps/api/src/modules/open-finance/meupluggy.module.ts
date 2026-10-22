import { type DynamicModule, Module } from '@nestjs/common';
import { TransactionsModule } from '../transactions/transactions.module.js';
import { meuPluggyEnabled, readEncryptionKey } from './credentials-crypto.js';
import { MeuPluggyController } from './meupluggy.controller.js';
import { MEUPLUGGY_ENCRYPTION_KEY, MeuPluggyService } from './meupluggy.service.js';
import { PrismaOpenFinanceLedger } from './prisma-ledger.js';

@Module({})
export class MeuPluggyModule {
  static register(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    if (!meuPluggyEnabled(env)) return { module: MeuPluggyModule };
    const key = readEncryptionKey(env.CREDENTIALS_ENCRYPTION_KEY);
    return {
      module: MeuPluggyModule,
      imports: [TransactionsModule],
      controllers: [MeuPluggyController],
      providers: [
        MeuPluggyService,
        PrismaOpenFinanceLedger,
        { provide: MEUPLUGGY_ENCRYPTION_KEY, useValue: key },
      ],
    };
  }
}

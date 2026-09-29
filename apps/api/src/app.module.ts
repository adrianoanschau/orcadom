import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { ZodValidationPipe } from 'nestjs-zod';
import { AppController } from './app.controller.js';
import { AppThrottlerGuard } from './common/guards/app-throttler.guard.js';
import { HouseholdGuard } from './common/guards/household.guard.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { ActorContextInterceptor } from './common/interceptors/actor-context.interceptor.js';
import { ObservabilityModule } from './common/observability/observability.module.js';
import { PrismaModule } from './common/prisma.module.js';
import {
  THROTTLE_DEFAULT_LIMIT,
  THROTTLE_DISABLED,
  THROTTLE_ERROR_MESSAGE,
  THROTTLE_TTL_MS,
} from './common/throttle/throttle.constants.js';
import { AccountsModule } from './modules/accounts/accounts.module.js';
import { AuditLogsModule } from './modules/audit-logs/audit-logs.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { BudgetsModule } from './modules/budgets/budgets.module.js';
import { CategoriesModule } from './modules/categories/categories.module.js';
import { DashboardModule } from './modules/dashboard/dashboard.module.js';
import { AutomationModule } from './modules/automation/automation.module.js';
import { BankAccountMappingsModule } from './modules/bank-account-mappings/bank-account-mappings.module.js';
import { ImportsModule } from './modules/imports/imports.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { SettingsModule } from './modules/settings/settings.module.js';
import { InstallmentPlansModule } from './modules/installment-plans/installment-plans.module.js';
import { RecurringTransactionsModule } from './modules/recurring-transactions/recurring-transactions.module.js';
import { ReportsModule } from './modules/reports/reports.module.js';
import { HouseholdsModule } from './modules/households/households.module.js';
import { OnboardingModule } from './modules/onboarding/onboarding.module.js';
import { SavingsGoalsModule } from './modules/savings-goals/savings-goals.module.js';
import { TransactionsModule } from './modules/transactions/transactions.module.js';

const cronImports = process.env.CRON_DISABLED === 'true' ? [] : [ScheduleModule.forRoot()];

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot({
      skipIf: () => THROTTLE_DISABLED,
      errorMessage: THROTTLE_ERROR_MESSAGE,
      throttlers: [{ name: 'default', ttl: THROTTLE_TTL_MS, limit: THROTTLE_DEFAULT_LIMIT }],
    }),
    ObservabilityModule,
    EventEmitterModule.forRoot(),
    ...cronImports,
    PrismaModule,
    BudgetsModule,
    AuthModule,
    HouseholdsModule,
    AuditLogsModule,
    AccountsModule,
    CategoriesModule,
    TransactionsModule,
    InstallmentPlansModule,
    RecurringTransactionsModule,
    ReportsModule,
    SavingsGoalsModule,
    OnboardingModule,
    DashboardModule,
    ImportsModule,
    AutomationModule,
    SettingsModule,
    BankAccountMappingsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: HouseholdGuard },
    { provide: APP_INTERCEPTOR, useClass: ActorContextInterceptor },
  ],
})
export class AppModule {}

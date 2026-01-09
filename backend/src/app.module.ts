import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ScheduleModule } from '@nestjs/schedule';
import { join } from 'path';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { LineAccountsModule } from './line-accounts/line-accounts.module';
import { SlipVerificationModule } from './slip-verification/slip-verification.module';
import { ChatbotModule } from './chatbot/chatbot.module';
import { PackagesModule } from './packages/packages.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PaymentsModule } from './payments/payments.module';
import { SystemSettingsModule } from './system-settings/system-settings.module';
import { RedisModule } from './redis/redis.module';
import { WebsocketModule } from './websocket/websocket.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { CommonModule } from './common/common.module';
import { TasksModule } from './tasks/tasks.module';
import { ChatMessagesModule } from './chat-messages/chat-messages.module';
import { SlipTemplatesModule } from './slip-templates/slip-templates.module';
import { BanksModule } from './banks/banks.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';
import { ThunderApiModule } from './thunder-api/thunder-api.module';
import { SystemResponseTemplatesModule } from './system-response-templates/system-response-templates.module';
import { WalletModule } from './wallet/wallet.module';
import { EventBusModule } from './core/events';
import { SecurityModule } from './utils/security.module';
import { RateLimitModule } from './common/rate-limit.module';

@Module({
  imports: [
    // Core modules (Event Bus - Global)
    EventBusModule,
    SecurityModule,

    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),

    // Schedule module for cron jobs
    ScheduleModule.forRoot(),

    // Serve static files (Frontend)
    ServeStaticModule.forRoot({
      rootPath: join(__dirname, '..', 'public'),
      exclude: ['/api*', '/webhook*', '/socket.io*'],
    }),

    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => {
        const uri = configService.get<string>('MONGODB_URI');
        if (!uri) {
          console.error('❌ MONGODB_URI not set! App will fail to start.');
          throw new Error('MONGODB_URI environment variable is required');
        }
        console.log('🔌 Connecting to MongoDB...');
        return {
          uri,
          dbName: configService.get<string>('MONGODB_DATABASE', 'lineoa_system'),
          retryAttempts: 5,
          retryDelay: 2000,
          serverSelectionTimeoutMS: 30000,
          connectTimeoutMS: 30000,
          socketTimeoutMS: 45000,
        };
      },
      inject: [ConfigService],
    }),

    // Common module (guards, utilities)
    CommonModule,

    // Feature modules
    DatabaseModule,
    RedisModule,
    HealthModule,
    AuthModule,
    UsersModule,
    LineAccountsModule,
    SlipVerificationModule,
    ChatbotModule,
    PackagesModule,
    SubscriptionsModule,
    PaymentsModule,
    SystemSettingsModule,
    WebsocketModule,
    TasksModule,

    // New modules
    ChatMessagesModule,
    SlipTemplatesModule,
    BanksModule,
    ActivityLogsModule,
    ThunderApiModule,
    SystemResponseTemplatesModule,
    WalletModule,
    RateLimitModule,
  ],
})
export class AppModule { }

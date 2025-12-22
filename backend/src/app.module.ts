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

@Module({
  imports: [
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
          console.warn('⚠️ MONGODB_URI not set, using default connection');
        }
        return {
          uri: uri || 'mongodb://localhost:27017/lineoa_system',
          dbName: configService.get<string>('MONGODB_DATABASE', 'lineoa_system'),
          retryAttempts: 3,
          retryDelay: 1000,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 10000,
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
  ],
})
export class AppModule {}

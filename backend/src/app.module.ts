import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
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

@Module({
  imports: [
    // Configuration
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../.env'],
    }),
    
    // Database
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        uri: configService.get<string>('MONGODB_URI'),
        dbName: configService.get<string>('MONGODB_DATABASE', 'lineoa_system'),
      }),
      inject: [ConfigService],
    }),
    
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
  ],
})
export class AppModule {}

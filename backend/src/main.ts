import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
      // Required for LINE signature verification (use req.rawBody)
      rawBody: true,
    });

    // Increase body size limit for base64 image uploads (10MB)
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));


    // Enable CORS with safe origin validation
    // Note: Webhooks (LINE) and health checks don't send Origin headers
    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests without Origin header (LINE webhooks, health checks, server-to-server)
        if (!origin) {
          return callback(null, true);
        }

        // Validate origin format to prevent header injection
        try {
          const url = new URL(origin);
          if (!['http:', 'https:'].includes(url.protocol)) {
            return callback(new Error('Invalid origin protocol'), false);
          }
        } catch {
          return callback(new Error('Invalid origin format'), false);
        }

        // Allow Railway domains (strict suffix match)
        if (origin.endsWith('.railway.app') || origin === 'https://railway.app') {
          return callback(null, true);
        }

        // Allow localhost for development
        if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) {
          return callback(null, true);
        }

        // Check custom CORS_ORIGINS env var (exact match only, no wildcards)
        const allowed = (process.env.CORS_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
        if (allowed.includes(origin)) {
          return callback(null, true);
        }

        // Reject unknown origins
        logger.warn(`CORS rejected origin: ${origin}`);
        return callback(new Error('Not allowed by CORS'), false);
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    });

    // Cookie parser
    app.use(cookieParser());

    // Global validation pipe
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: false,
        transform: true,
      }),
    );

    // Swagger documentation
    const config = new DocumentBuilder()
      .setTitle('LINE OA Management System')
      .setDescription('API documentation for LINE OA Management System')
      .setVersion('2.0')
      .addBearerAuth()
      .addCookieAuth('session_id')
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);

    const port = process.env.PORT || 4000;
    await app.listen(port, '0.0.0.0');
    logger.log(`🚀 Server running on port ${port}`);
    logger.log(`📚 Swagger docs at /api/docs`);
    logger.log(`🌐 Frontend served from /public`);
  } catch (error) {
    logger.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

bootstrap();

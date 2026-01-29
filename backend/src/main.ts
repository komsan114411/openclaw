import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import * as cookieParser from 'cookie-parser';
import * as bodyParser from 'body-parser';
import * as crypto from 'crypto';
import helmet from 'helmet';

async function bootstrap() {
  const logger = new Logger('Bootstrap');

  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
      // Required for LINE signature verification (use req.rawBody)
      rawBody: true,
    });

    // Security headers
    app.use(helmet({
      contentSecurityPolicy: false, // Disable CSP for API (frontend handles CSP)
      crossOriginEmbedderPolicy: false, // Allow embedding for API responses
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Enable important security headers
      xFrameOptions: { action: 'deny' }, // Prevent clickjacking
      xContentTypeOptions: true, // Prevent MIME sniffing
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      hsts: {
        maxAge: 31536000, // 1 year
        includeSubDomains: true,
        preload: true,
      },
    }));

    // Increase body size limit for base64 image uploads (10MB)
    app.use(bodyParser.json({ limit: '10mb' }));
    app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

    // Correlation ID middleware for request tracking
    app.use((req: any, res: any, next: any) => {
      req.id = req.headers['x-request-id'] || crypto.randomUUID();
      res.setHeader('x-request-id', req.id);
      next();
    });

    // Enable CORS with strict origin validation
    const allowedOrigins = process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
      : ['http://localhost:3000']; // Default to localhost only in development

    app.enableCors({
      origin: (origin, callback) => {
        // Allow requests with no origin (mobile apps, Postman, server-to-server)
        if (!origin) {
          callback(null, true);
          return;
        }

        // Check if origin is in allowed list
        if (allowedOrigins.includes(origin) ||
            allowedOrigins.some(allowed => origin.endsWith(allowed.replace('https://', '.').replace('http://', '.')))) {
          callback(null, true);
        } else {
          logger.warn(`CORS blocked request from origin: ${origin}`);
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'X-Request-Id', 'X-CSRF-Token'],
      methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    });

    // Cookie parser
    app.use(cookieParser());

    // Global exception filter for structured error handling
    app.useGlobalFilters(new GlobalExceptionFilter());

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
    logger.log(`🌍 CORS enabled for: ${allowedOrigins.join(', ')}`);
  } catch (error) {
    logger.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

bootstrap();

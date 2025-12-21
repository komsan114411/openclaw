import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import * as cookieParser from 'cookie-parser';
import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  
  try {
    const app = await NestFactory.create(AppModule, {
      logger: ['error', 'warn', 'log'],
    });
    
    // Enable CORS
    app.enableCors({
      origin: '*',
      credentials: true,
    });
    
    // Cookie parser
    app.use(cookieParser());

    // Proxy non-API requests to frontend (if frontend is running)
    const frontendUrl = process.env.FRONTEND_INTERNAL_URL || 'http://localhost:3000';
    
    const frontendProxy = createProxyMiddleware({
      target: frontendUrl,
      changeOrigin: true,
      ws: true,
      on: {
        error: (err: any, req: any, res: any) => {
          logger.warn(`Frontend proxy error: ${err.message}`);
          if (res.redirect) {
            res.redirect('/api/docs');
          }
        },
      },
    });
    
    app.use((req: Request, res: Response, next: NextFunction) => {
      // Skip API routes
      if (req.path.startsWith('/api') || req.path.startsWith('/socket.io') || req.path.startsWith('/webhook')) {
        return next();
      }
      
      // Proxy to frontend
      return frontendProxy(req, res, next);
    });
    
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
    logger.log(`🌐 Frontend proxy to ${frontendUrl}`);
  } catch (error) {
    logger.error(`❌ Failed to start server: ${error.message}`);
    process.exit(1);
  }
}

bootstrap();

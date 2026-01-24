import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Global exception filter for structured error handling
 * Catches all unhandled exceptions and returns consistent error responses
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // Generate correlation ID for tracking
    const correlationId = (request as any).id ||
      request.headers['x-request-id'] ||
      `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    // Determine status code and message
    let status: number;
    let message: string;
    let errorCode: string;
    let details: any = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      if (typeof response === 'object' && response !== null) {
        message = (response as any).message || exception.message;
        errorCode = (response as any).errorCode || `HTTP_${status}`;
        details = (response as any).details;
      } else {
        message = String(response);
        errorCode = `HTTP_${status}`;
      }
    } else if (exception instanceof Error) {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'เกิดข้อผิดพลาดภายในระบบ';
      errorCode = 'INTERNAL_ERROR';

      // Log full error for debugging (but don't expose to client)
      this.logger.error(
        `[${correlationId}] Unhandled exception: ${exception.message}`,
        exception.stack,
      );
    } else {
      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ';
      errorCode = 'UNKNOWN_ERROR';
    }

    // Build error response
    const errorResponse = {
      success: false,
      error: {
        code: errorCode,
        message,
        ...(details && { details }),
      },
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
        method: request.method,
        correlationId,
      },
    };

    // Log error with context
    const logLevel = status >= 500 ? 'error' : 'warn';
    this.logger[logLevel](
      `[${correlationId}] ${request.method} ${request.url} - ${status} ${errorCode}: ${message}`,
      {
        correlationId,
        status,
        errorCode,
        path: request.url,
        method: request.method,
        userAgent: request.headers['user-agent'],
        ip: request.ip || request.headers['x-forwarded-for'],
      },
    );

    // Send response
    response.status(status).json(errorResponse);
  }
}

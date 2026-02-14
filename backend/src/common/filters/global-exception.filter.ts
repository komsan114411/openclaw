import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

// Map class-validator field names to Thai labels
const FIELD_LABELS: Record<string, string> = {
  accountName: 'ชื่อบัญชี',
  channelId: 'Channel ID',
  channelSecret: 'Channel Secret',
  accessToken: 'Access Token',
  description: 'คำอธิบาย',
  username: 'ชื่อผู้ใช้',
  password: 'รหัสผ่าน',
  email: 'อีเมล',
  name: 'ชื่อ',
  phoneNumber: 'เบอร์โทรศัพท์',
};

/**
 * Global exception filter for structured error handling
 * Catches all unhandled exceptions and returns consistent error responses
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  /**
   * Translate class-validator messages to Thai
   */
  private translateValidationMessage(msg: string): string {
    // "fieldName should not be empty" → "กรุณากรอก <Thai label>"
    const emptyMatch = msg.match(/^(\w+) should not be empty$/);
    if (emptyMatch) {
      const label = FIELD_LABELS[emptyMatch[1]] || emptyMatch[1];
      return `กรุณากรอก${label}`;
    }

    // "fieldName must be a string" → "<Thai label> ต้องเป็นข้อความ"
    const stringMatch = msg.match(/^(\w+) must be a string$/);
    if (stringMatch) {
      const label = FIELD_LABELS[stringMatch[1]] || stringMatch[1];
      return `${label} ต้องเป็นข้อความ`;
    }

    // "fieldName must be a mongodb id" → "<Thai label> ไม่ถูกต้อง"
    const mongoIdMatch = msg.match(/^(\w+) must be a mongodb id$/);
    if (mongoIdMatch) {
      const label = FIELD_LABELS[mongoIdMatch[1]] || mongoIdMatch[1];
      return `${label} ไม่ถูกต้อง`;
    }

    return msg;
  }

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
    let message: string | string[];
    let errorCode: string;
    let details: any = null;

    let field: string | null = null;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const rawMessage = (exceptionResponse as any).message || exception.message;
        errorCode = (exceptionResponse as any).errorCode || (exceptionResponse as any).code || `HTTP_${status}`;
        details = (exceptionResponse as any).details;
        field = (exceptionResponse as any).field || null;

        // Handle ValidationPipe array messages — translate to Thai
        if (Array.isArray(rawMessage)) {
          const translated = rawMessage.map((m: string) => this.translateValidationMessage(m));
          message = translated.join(', ');
        } else {
          message = rawMessage;
        }
      } else {
        message = String(exceptionResponse);
        errorCode = `HTTP_${status}`;
      }
    } else if (this.isMongoError(exception)) {
      // Handle MongoDB duplicate key errors
      const mongoErr = exception as any;
      if (mongoErr.code === 11000) {
        status = HttpStatus.BAD_REQUEST;
        errorCode = 'DUPLICATE_KEY';
        const keyPattern = mongoErr.keyPattern || {};
        if (keyPattern.accountName) {
          message = 'ชื่อบัญชีนี้มีอยู่ในระบบแล้ว กรุณาใช้ชื่ออื่น';
        } else if (keyPattern.channelId) {
          message = 'Channel ID นี้มีอยู่ในระบบแล้ว กรุณาตรวจสอบว่าใส่ Channel ID ถูกต้อง';
        } else {
          message = 'ข้อมูลซ้ำกับที่มีอยู่แล้วในระบบ';
        }
      } else {
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message = 'เกิดข้อผิดพลาดจากฐานข้อมูล';
        errorCode = 'DATABASE_ERROR';
        this.logger.error(
          `[${correlationId}] MongoDB error: ${mongoErr.message}`,
          mongoErr.stack,
        );
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

    // Build error response — include message at both root and nested level for compatibility
    const messageStr = Array.isArray(message) ? message.join(', ') : message;
    const errorResponse = {
      success: false,
      message: messageStr,
      error: {
        code: errorCode,
        message: messageStr,
        ...(field && { field }),
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
      `[${correlationId}] ${request.method} ${request.url} - ${status} ${errorCode}: ${messageStr}`,
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

  private isMongoError(error: unknown): boolean {
    if (!(error instanceof Error)) return false;
    return error.constructor?.name === 'MongoServerError' ||
      error.constructor?.name === 'MongoError' ||
      (error as any).code === 11000;
  }
}

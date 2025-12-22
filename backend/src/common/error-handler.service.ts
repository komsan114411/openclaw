import { Injectable, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { RedisService } from '../redis/redis.service';

export enum ErrorCode {
  // Authentication Errors
  AUTH_INVALID_CREDENTIALS = 'AUTH_INVALID_CREDENTIALS',
  AUTH_SESSION_EXPIRED = 'AUTH_SESSION_EXPIRED',
  AUTH_USER_BLOCKED = 'AUTH_USER_BLOCKED',
  AUTH_USER_NOT_FOUND = 'AUTH_USER_NOT_FOUND',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_INSUFFICIENT_PERMISSIONS',

  // Payment Errors
  PAYMENT_NOT_FOUND = 'PAYMENT_NOT_FOUND',
  PAYMENT_ALREADY_PROCESSED = 'PAYMENT_ALREADY_PROCESSED',
  PAYMENT_INVALID_AMOUNT = 'PAYMENT_INVALID_AMOUNT',
  PAYMENT_SLIP_DUPLICATE = 'PAYMENT_SLIP_DUPLICATE',
  PAYMENT_VERIFICATION_FAILED = 'PAYMENT_VERIFICATION_FAILED',
  PAYMENT_BANK_ACCOUNT_MISMATCH = 'PAYMENT_BANK_ACCOUNT_MISMATCH',

  // Quota Errors
  QUOTA_EXCEEDED = 'QUOTA_EXCEEDED',
  QUOTA_RESERVATION_FAILED = 'QUOTA_RESERVATION_FAILED',
  QUOTA_CONFIRMATION_FAILED = 'QUOTA_CONFIRMATION_FAILED',
  QUOTA_ROLLBACK_FAILED = 'QUOTA_ROLLBACK_FAILED',

  // Subscription Errors
  SUBSCRIPTION_NOT_FOUND = 'SUBSCRIPTION_NOT_FOUND',
  SUBSCRIPTION_EXPIRED = 'SUBSCRIPTION_EXPIRED',
  SUBSCRIPTION_CREATION_FAILED = 'SUBSCRIPTION_CREATION_FAILED',

  // LINE Errors
  LINE_ACCOUNT_NOT_FOUND = 'LINE_ACCOUNT_NOT_FOUND',
  LINE_WEBHOOK_INVALID_SIGNATURE = 'LINE_WEBHOOK_INVALID_SIGNATURE',
  LINE_MESSAGE_SEND_FAILED = 'LINE_MESSAGE_SEND_FAILED',
  LINE_IMAGE_DOWNLOAD_FAILED = 'LINE_IMAGE_DOWNLOAD_FAILED',

  // Slip Verification Errors
  SLIP_VERIFICATION_FAILED = 'SLIP_VERIFICATION_FAILED',
  SLIP_INVALID_IMAGE = 'SLIP_INVALID_IMAGE',
  SLIP_API_ERROR = 'SLIP_API_ERROR',
  SLIP_API_KEY_INVALID = 'SLIP_API_KEY_INVALID',
  SLIP_NOT_FOUND = 'SLIP_NOT_FOUND',
  SLIP_DUPLICATE = 'SLIP_DUPLICATE',

  // AI/Chatbot Errors
  AI_API_ERROR = 'AI_API_ERROR',
  AI_API_KEY_INVALID = 'AI_API_KEY_INVALID',
  AI_RATE_LIMITED = 'AI_RATE_LIMITED',

  // General Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  RATE_LIMITED = 'RATE_LIMITED',
  CONCURRENT_OPERATION = 'CONCURRENT_OPERATION',
  RESOURCE_NOT_FOUND = 'RESOURCE_NOT_FOUND',
  OPERATION_TIMEOUT = 'OPERATION_TIMEOUT',
}

export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  messageEn?: string;
  httpStatus: HttpStatus;
  retryable: boolean;
  userFriendlyMessage: string;
}

export interface OperationResult<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: ErrorCode;
    message: string;
    details?: any;
  };
}

@Injectable()
export class ErrorHandlerService {
  private readonly logger = new Logger(ErrorHandlerService.name);

  private errorMap: Map<ErrorCode, ErrorDetails> = new Map([
    // Authentication Errors
    [ErrorCode.AUTH_INVALID_CREDENTIALS, {
      code: ErrorCode.AUTH_INVALID_CREDENTIALS,
      message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง',
      messageEn: 'Invalid username or password',
      httpStatus: HttpStatus.UNAUTHORIZED,
      retryable: false,
      userFriendlyMessage: 'กรุณาตรวจสอบชื่อผู้ใช้และรหัสผ่าน',
    }],
    [ErrorCode.AUTH_SESSION_EXPIRED, {
      code: ErrorCode.AUTH_SESSION_EXPIRED,
      message: 'Session หมดอายุ',
      messageEn: 'Session expired',
      httpStatus: HttpStatus.UNAUTHORIZED,
      retryable: false,
      userFriendlyMessage: 'กรุณาเข้าสู่ระบบใหม่',
    }],
    [ErrorCode.AUTH_USER_BLOCKED, {
      code: ErrorCode.AUTH_USER_BLOCKED,
      message: 'บัญชีถูกระงับ',
      messageEn: 'Account blocked',
      httpStatus: HttpStatus.FORBIDDEN,
      retryable: false,
      userFriendlyMessage: 'บัญชีของคุณถูกระงับ กรุณาติดต่อผู้ดูแลระบบ',
    }],

    // Payment Errors
    [ErrorCode.PAYMENT_SLIP_DUPLICATE, {
      code: ErrorCode.PAYMENT_SLIP_DUPLICATE,
      message: 'สลิปนี้เคยถูกใช้แล้ว',
      messageEn: 'Duplicate slip',
      httpStatus: HttpStatus.CONFLICT,
      retryable: false,
      userFriendlyMessage: 'สลิปนี้เคยถูกใช้แล้ว กรุณาใช้สลิปใหม่',
    }],
    [ErrorCode.PAYMENT_ALREADY_PROCESSED, {
      code: ErrorCode.PAYMENT_ALREADY_PROCESSED,
      message: 'รายการชำระเงินนี้ได้ดำเนินการแล้ว',
      messageEn: 'Payment already processed',
      httpStatus: HttpStatus.CONFLICT,
      retryable: false,
      userFriendlyMessage: 'รายการชำระเงินนี้ได้ดำเนินการแล้ว',
    }],
    [ErrorCode.PAYMENT_BANK_ACCOUNT_MISMATCH, {
      code: ErrorCode.PAYMENT_BANK_ACCOUNT_MISMATCH,
      message: 'บัญชีผู้รับไม่ตรงกัน',
      messageEn: 'Bank account mismatch',
      httpStatus: HttpStatus.BAD_REQUEST,
      retryable: false,
      userFriendlyMessage: 'บัญชีผู้รับในสลิปไม่ตรงกับบัญชีที่ระบบรองรับ',
    }],

    // Quota Errors
    [ErrorCode.QUOTA_EXCEEDED, {
      code: ErrorCode.QUOTA_EXCEEDED,
      message: 'โควต้าหมด',
      messageEn: 'Quota exceeded',
      httpStatus: HttpStatus.PAYMENT_REQUIRED,
      retryable: false,
      userFriendlyMessage: 'โควต้าการตรวจสอบสลิปหมดแล้ว กรุณาเติมแพ็คเกจ',
    }],
    [ErrorCode.QUOTA_RESERVATION_FAILED, {
      code: ErrorCode.QUOTA_RESERVATION_FAILED,
      message: 'ไม่สามารถจองโควต้าได้',
      messageEn: 'Quota reservation failed',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      retryable: true,
      userFriendlyMessage: 'ระบบไม่สามารถจองโควต้าได้ กรุณาลองใหม่อีกครั้ง',
    }],

    // Slip Verification Errors
    [ErrorCode.SLIP_INVALID_IMAGE, {
      code: ErrorCode.SLIP_INVALID_IMAGE,
      message: 'รูปภาพไม่ถูกต้อง',
      messageEn: 'Invalid image',
      httpStatus: HttpStatus.BAD_REQUEST,
      retryable: false,
      userFriendlyMessage: 'รูปภาพไม่ถูกต้องหรือไม่ใช่รูปสลิป กรุณาส่งรูปสลิปที่ชัดเจน',
    }],
    [ErrorCode.SLIP_API_ERROR, {
      code: ErrorCode.SLIP_API_ERROR,
      message: 'API ตรวจสอบสลิปมีปัญหา',
      messageEn: 'Slip API error',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      retryable: true,
      userFriendlyMessage: 'ระบบตรวจสอบสลิปมีปัญหา กรุณาลองใหม่อีกครั้ง',
    }],
    [ErrorCode.SLIP_API_KEY_INVALID, {
      code: ErrorCode.SLIP_API_KEY_INVALID,
      message: 'API Key ไม่ถูกต้อง',
      messageEn: 'Invalid API key',
      httpStatus: HttpStatus.UNAUTHORIZED,
      retryable: false,
      userFriendlyMessage: 'ระบบยังไม่ได้ตั้งค่า API Key',
    }],
    [ErrorCode.SLIP_DUPLICATE, {
      code: ErrorCode.SLIP_DUPLICATE,
      message: 'สลิปซ้ำ',
      messageEn: 'Duplicate slip',
      httpStatus: HttpStatus.CONFLICT,
      retryable: false,
      userFriendlyMessage: 'สลิปนี้เคยถูกใช้แล้ว',
    }],

    // LINE Errors
    [ErrorCode.LINE_IMAGE_DOWNLOAD_FAILED, {
      code: ErrorCode.LINE_IMAGE_DOWNLOAD_FAILED,
      message: 'ดาวน์โหลดรูปภาพไม่สำเร็จ',
      messageEn: 'Image download failed',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      retryable: true,
      userFriendlyMessage: 'ไม่สามารถดาวน์โหลดรูปภาพได้ กรุณาลองส่งใหม่',
    }],
    [ErrorCode.LINE_MESSAGE_SEND_FAILED, {
      code: ErrorCode.LINE_MESSAGE_SEND_FAILED,
      message: 'ส่งข้อความไม่สำเร็จ',
      messageEn: 'Message send failed',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      retryable: true,
      userFriendlyMessage: 'ไม่สามารถส่งข้อความได้',
    }],

    // AI Errors
    [ErrorCode.AI_API_ERROR, {
      code: ErrorCode.AI_API_ERROR,
      message: 'AI API มีปัญหา',
      messageEn: 'AI API error',
      httpStatus: HttpStatus.SERVICE_UNAVAILABLE,
      retryable: true,
      userFriendlyMessage: 'ระบบ AI มีปัญหา กรุณาลองใหม่อีกครั้ง',
    }],
    [ErrorCode.AI_RATE_LIMITED, {
      code: ErrorCode.AI_RATE_LIMITED,
      message: 'AI ถูกจำกัดการใช้งาน',
      messageEn: 'AI rate limited',
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      retryable: true,
      userFriendlyMessage: 'ระบบ AI ไม่สามารถตอบได้ในขณะนี้ กรุณาลองใหม่ภายหลัง',
    }],

    // General Errors
    [ErrorCode.RATE_LIMITED, {
      code: ErrorCode.RATE_LIMITED,
      message: 'คำขอมากเกินไป',
      messageEn: 'Rate limited',
      httpStatus: HttpStatus.TOO_MANY_REQUESTS,
      retryable: true,
      userFriendlyMessage: 'คุณส่งคำขอมากเกินไป กรุณารอสักครู่',
    }],
    [ErrorCode.INTERNAL_ERROR, {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'เกิดข้อผิดพลาดภายใน',
      messageEn: 'Internal error',
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      retryable: true,
      userFriendlyMessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    }],
    [ErrorCode.CONCURRENT_OPERATION, {
      code: ErrorCode.CONCURRENT_OPERATION,
      message: 'กำลังประมวลผลอยู่',
      messageEn: 'Concurrent operation in progress',
      httpStatus: HttpStatus.CONFLICT,
      retryable: true,
      userFriendlyMessage: 'ระบบกำลังประมวลผลรายการนี้อยู่ กรุณารอสักครู่',
    }],
    [ErrorCode.OPERATION_TIMEOUT, {
      code: ErrorCode.OPERATION_TIMEOUT,
      message: 'หมดเวลาการประมวลผล',
      messageEn: 'Operation timeout',
      httpStatus: HttpStatus.GATEWAY_TIMEOUT,
      retryable: true,
      userFriendlyMessage: 'การประมวลผลใช้เวลานานเกินไป กรุณาลองใหม่',
    }],
  ]);

  constructor(private redisService: RedisService) {}

  /**
   * Get error details by code
   */
  getErrorDetails(code: ErrorCode): ErrorDetails {
    return this.errorMap.get(code) || {
      code: ErrorCode.INTERNAL_ERROR,
      message: 'Unknown error',
      httpStatus: HttpStatus.INTERNAL_SERVER_ERROR,
      retryable: true,
      userFriendlyMessage: 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง',
    };
  }

  /**
   * Create an HTTP exception with proper error details
   */
  createException(code: ErrorCode, additionalMessage?: string): HttpException {
    const details = this.getErrorDetails(code);
    return new HttpException(
      {
        statusCode: details.httpStatus,
        errorCode: code,
        message: additionalMessage || details.message,
        userMessage: details.userFriendlyMessage,
        retryable: details.retryable,
      },
      details.httpStatus,
    );
  }

  /**
   * Create a success result
   */
  success<T>(data: T): OperationResult<T> {
    return { success: true, data };
  }

  /**
   * Create an error result
   */
  error(code: ErrorCode, details?: any): OperationResult {
    const errorDetails = this.getErrorDetails(code);
    return {
      success: false,
      error: {
        code,
        message: errorDetails.userFriendlyMessage,
        details,
      },
    };
  }

  /**
   * Log error with context
   */
  logError(
    context: string,
    error: Error | any,
    additionalInfo?: Record<string, any>,
  ): void {
    const errorInfo = {
      message: error?.message || String(error),
      stack: error?.stack,
      ...additionalInfo,
    };
    this.logger.error(`[${context}] ${errorInfo.message}`, errorInfo);
  }

  /**
   * Execute operation with retry logic
   */
  async withRetry<T>(
    operation: () => Promise<T>,
    options: {
      maxRetries?: number;
      delayMs?: number;
      operationName?: string;
      onRetry?: (attempt: number, error: any) => void;
    } = {},
  ): Promise<T> {
    const { maxRetries = 3, delayMs = 1000, operationName = 'Operation', onRetry } = options;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(`${operationName} attempt ${attempt}/${maxRetries} failed: ${lastError.message}`);
        
        if (onRetry) {
          onRetry(attempt, error);
        }

        if (attempt < maxRetries) {
          const delay = delayMs * Math.pow(2, attempt - 1); // Exponential backoff
          await this.sleep(delay);
        }
      }
    }

    throw lastError;
  }

  /**
   * Execute operation with timeout
   */
  async withTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number,
    operationName: string = 'Operation',
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(this.createException(ErrorCode.OPERATION_TIMEOUT, `${operationName} timed out`));
      }, timeoutMs);
    });

    return Promise.race([operation(), timeoutPromise]);
  }

  /**
   * Execute operation with distributed lock
   */
  async withLock<T>(
    lockKey: string,
    operation: () => Promise<T>,
    options: {
      ttlSeconds?: number;
      waitForLock?: boolean;
      maxWaitMs?: number;
    } = {},
  ): Promise<T> {
    const { ttlSeconds = 30, waitForLock = false, maxWaitMs = 5000 } = options;
    const startTime = Date.now();

    while (true) {
      const lockToken = await this.redisService.acquireLock(lockKey, ttlSeconds);
      
      if (lockToken) {
        try {
          return await operation();
        } finally {
          await this.redisService.releaseLock(lockKey, lockToken);
        }
      }

      if (!waitForLock || Date.now() - startTime > maxWaitMs) {
        throw this.createException(ErrorCode.CONCURRENT_OPERATION);
      }

      await this.sleep(100);
    }
  }

  /**
   * Execute operation with rate limiting
   */
  async withRateLimit<T>(
    key: string,
    operation: () => Promise<T>,
    options: {
      limit?: number;
      windowSeconds?: number;
    } = {},
  ): Promise<T> {
    const { limit = 10, windowSeconds = 60 } = options;
    
    const allowed = await this.redisService.rateLimit(key, limit, windowSeconds);
    if (!allowed) {
      throw this.createException(ErrorCode.RATE_LIMITED);
    }

    return operation();
  }

  /**
   * Safe operation wrapper - never throws, returns OperationResult
   */
  async safeExecute<T>(
    operation: () => Promise<T>,
    errorCode: ErrorCode = ErrorCode.INTERNAL_ERROR,
    context?: string,
  ): Promise<OperationResult<T>> {
    try {
      const result = await operation();
      return this.success(result);
    } catch (error) {
      if (context) {
        this.logError(context, error);
      }
      return this.error(errorCode, { originalError: (error as Error).message });
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

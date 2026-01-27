import {
  Injectable,
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../../redis/redis.service';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitOptions {
  limit: number;
  windowSeconds: number;
  keyPrefix?: string;
}

export const RateLimit = (options: RateLimitOptions) => {
  return (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(RATE_LIMIT_KEY, options, descriptor.value);
    return descriptor;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private redisService: RedisService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.get<RateLimitOptions>(
      RATE_LIMIT_KEY,
      context.getHandler(),
    );

    if (!options) {
      return true; // No rate limit configured
    }

    const request = context.switchToHttp().getRequest();
    const key = this.getKey(request, options.keyPrefix);

    const allowed = await this.redisService.rateLimit(
      key,
      options.limit,
      options.windowSeconds,
    );

    if (!allowed) {
      const remaining = await this.redisService.getRateLimitRemaining(key, options.limit);
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: 'คำขอมากเกินไป กรุณารอสักครู่แล้วลองใหม่',
          error: 'Too Many Requests',
          retryAfter: options.windowSeconds,
          remaining,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private getKey(request: any, prefix?: string): string {
    // Use user ID if authenticated, otherwise use real client IP
    const userId = request.user?.userId;
    const ip = this.getClientIp(request);
    const identifier = userId || ip;
    const path = request.route?.path || request.url;

    return `${prefix || 'api'}:${path}:${identifier}`;
  }

  /**
   * Get real client IP from headers (supports proxies like Railway, Cloudflare)
   */
  private getClientIp(request: any): string {
    // Check X-Forwarded-For header (most common proxy header)
    const forwardedFor = request.headers?.['x-forwarded-for'];
    if (forwardedFor) {
      // X-Forwarded-For can contain multiple IPs: client, proxy1, proxy2
      // The first one is the real client IP
      const ips = forwardedFor.split(',').map((ip: string) => ip.trim());
      if (ips[0]) return ips[0];
    }

    // Check X-Real-IP header (Nginx/Railway)
    const realIp = request.headers?.['x-real-ip'];
    if (realIp) return realIp;

    // Check CF-Connecting-IP header (Cloudflare)
    const cfIp = request.headers?.['cf-connecting-ip'];
    if (cfIp) return cfIp;

    // Fallback to request.ip or connection remote address
    return request.ip || request.connection?.remoteAddress || 'unknown';
  }
}

import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

/**
 * CSRF Protection Middleware (Double Submit Cookie Pattern)
 *
 * How it works:
 * 1. On every response, set a CSRF token in a readable cookie (not httpOnly)
 * 2. Frontend reads the cookie and sends it back via X-CSRF-Token header
 * 3. This middleware validates that the header matches the cookie
 *
 * Safe methods (GET, HEAD, OPTIONS) are skipped.
 * Webhook paths are skipped (they use HMAC signature verification instead).
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
    const isProduction = process.env.NODE_ENV === 'production';

    // Skip CSRF for safe methods
    if (safeMethods.includes(req.method)) {
      this.ensureCsrfCookie(req, res, isProduction);
      return next();
    }

    // Skip CSRF for webhook paths (they use HMAC signature)
    if (req.path.includes('/webhook')) {
      return next();
    }

    // Skip CSRF for public tracking endpoints (view/dismiss counts)
    if (req.path.match(/\/announcements\/[^/]+\/(view|dismiss)$/)) {
      return next();
    }

    // Validate CSRF token for state-changing requests
    const cookieToken = req.cookies?.['csrf-token'];
    const headerToken = req.headers['x-csrf-token'] as string;

    if (!cookieToken || !headerToken) {
      res.status(403).json({
        success: false,
        error: { code: 'CSRF_MISSING', message: 'CSRF token missing' },
      });
      return;
    }

    // Timing-safe comparison to prevent timing attacks
    try {
      const cookieBuf = Buffer.from(cookieToken, 'utf8');
      const headerBuf = Buffer.from(headerToken, 'utf8');

      if (cookieBuf.length !== headerBuf.length || !crypto.timingSafeEqual(cookieBuf, headerBuf)) {
        res.status(403).json({
          success: false,
          error: { code: 'CSRF_INVALID', message: 'CSRF token invalid' },
        });
        return;
      }
    } catch {
      res.status(403).json({
        success: false,
        error: { code: 'CSRF_INVALID', message: 'CSRF token invalid' },
      });
      return;
    }

    next();
  }

  private ensureCsrfCookie(req: Request, res: Response, isProduction: boolean) {
    if (!req.cookies?.['csrf-token']) {
      const token = crypto.randomBytes(32).toString('hex');
      res.cookie('csrf-token', token, {
        httpOnly: false, // Frontend must read this
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
      });
    }
  }
}

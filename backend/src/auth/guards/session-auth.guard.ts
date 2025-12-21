import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from '../auth.service';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Check session cookie
    const sessionId = request.cookies?.session_id;
    if (sessionId) {
      const user = await this.authService.validateSession(sessionId);
      if (user) {
        request.user = user;
        return true;
      }
    }

    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await this.authService.validateToken(token);
      if (payload) {
        request.user = {
          userId: payload.sub,
          username: payload.username,
          role: payload.role,
          forcePasswordChange: false,
        };
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }
}

import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { AuthService } from '../auth.service';
import { User, UserDocument } from '../../database/schemas/user.schema';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private authService: AuthService,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    
    // Check session cookie first (preferred)
    const sessionId = request.cookies?.session_id;
    if (sessionId) {
      const user = await this.authService.validateSession(sessionId);
      if (user) {
        request.user = user;
        return true;
      }
    }

    // Fallback to Authorization header (for API clients)
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await this.authService.validateToken(token);
      if (payload) {
        // Fetch user to get current status (blocked, forcePasswordChange)
        const userDoc = await this.userModel.findById(payload.sub);
        if (!userDoc || !userDoc.isActive || userDoc.isBlocked) {
          throw new UnauthorizedException('User account is inactive or blocked');
        }

        request.user = {
          userId: payload.sub,
          username: payload.username,
          role: payload.role,
          email: userDoc.email,
          fullName: userDoc.fullName,
          forcePasswordChange: userDoc.forcePasswordChange,
        };
        return true;
      }
    }

    throw new UnauthorizedException('Authentication required');
  }
}

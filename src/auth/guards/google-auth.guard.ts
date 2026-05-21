import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard kích hoạt GoogleStrategy.
 * Apply lên route GET /auth/google và GET /auth/google/callback.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {}

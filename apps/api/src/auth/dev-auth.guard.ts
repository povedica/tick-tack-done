import {
  type CanActivate,
  type ExecutionContext,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { DomainException } from '../http/domain.exception';
import type { AuthUser } from './auth-user';
import { SCOPES_KEY } from './scopes.decorator';

/**
 * Point 7 replaces this guard with PAT scope checks. Until then, AUTH_MODE=dev
 * resolves the caller from X-Dev-User-Email and grants the scopes the route declares.
 */
@Injectable()
export class DevAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scopes = this.reflector.getAllAndOverride<readonly string[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (scopes === undefined || scopes.length === 0) {
      return true;
    }
    if (process.env.AUTH_MODE !== 'dev') {
      throw new DomainException(
        HttpStatus.UNAUTHORIZED,
        'unauthorized',
        'Authentication is not configured',
      );
    }
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const email = request.header('x-dev-user-email');
    if (email === undefined || email.trim().length === 0) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Missing dev user');
    }
    const user = await this.prisma.user.findFirst({
      where: { email: email.trim(), deletedAt: null },
      select: { id: true, email: true, timeZone: true, taskCompleteChildren: true },
    });
    if (user === null) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Unknown dev user');
    }
    request.user = {
      id: user.id,
      email: user.email,
      timeZone: user.timeZone,
      completeChildren: user.taskCompleteChildren,
    };
    return true;
  }
}

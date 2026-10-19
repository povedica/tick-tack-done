import { createParamDecorator, type ExecutionContext, HttpStatus } from '@nestjs/common';
import type { Request } from 'express';
import { DomainException } from '../http/domain.exception.js';
import type { AuthUser } from './auth-user.js';

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const request = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
  if (request.user === undefined) {
    throw new DomainException(
      HttpStatus.UNAUTHORIZED,
      'unauthorized',
      'Authentication is required',
    );
  }
  return request.user;
});

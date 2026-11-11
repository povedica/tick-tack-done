import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import {
  ApiAcceptedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import {
  PasswordResetAcceptedDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  PasswordResetVerifyDto,
  PasswordResetVerifyResponseDto,
} from './password-reset.dto.js';
import { PasswordResetService } from './password-reset.service.js';
import { publicOrigin } from './public-origin.js';
import { Public } from './scopes.decorator.js';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie.js';
import { DomainException } from '../http/domain.exception.js';

@ApiTags('auth')
@Controller('auth/password-reset')
export class PasswordResetController {
  constructor(@Inject(PasswordResetService) private readonly resets: PasswordResetService) {}

  @Post('request')
  @Public()
  @HttpCode(202)
  @ApiOperation({
    summary: 'Ask for a password reset link. The response does not reveal accounts.',
  })
  @ApiAcceptedResponse({ type: PasswordResetAcceptedDto })
  async request(
    @Body() dto: PasswordResetRequestDto,
    @Req() req: Request,
  ): Promise<PasswordResetAcceptedDto> {
    assertResetOrigin(req.header('origin'));
    await this.resets.request(dto, meta(req));
    return { status: 'accepted' };
  }

  @Post('verify')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Check a reset link without consuming it' })
  @ApiOkResponse({ type: PasswordResetVerifyResponseDto })
  verify(
    @Body() dto: PasswordResetVerifyDto,
    @Req() req: Request,
  ): Promise<PasswordResetVerifyResponseDto> {
    assertResetOrigin(req.header('origin'));
    return this.resets.verify(dto.token, meta(req));
  }

  @Post('confirm')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Set a new password and revoke sessions and OAuth grants' })
  @ApiNoContentResponse()
  async confirm(
    @Body() dto: PasswordResetConfirmDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    assertResetOrigin(req.header('origin'));
    await this.resets.confirm(dto, meta(req));
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }
}

export function assertResetOrigin(originHeader: string | undefined): void {
  if (originHeader === undefined || originHeader.length === 0) {
    return;
  }
  let presented: string;
  try {
    presented = new URL(originHeader).origin;
  } catch {
    throw originMismatch();
  }
  if (presented !== new URL(publicOrigin()).origin) {
    throw originMismatch();
  }
}

function originMismatch(): DomainException {
  return new DomainException(HttpStatus.FORBIDDEN, 'origin_mismatch', 'Origin is not allowed');
}

function meta(req: Request): { userAgent: string | null; ip: string | null } {
  const agent = req.header('user-agent');
  return {
    userAgent: agent === undefined ? null : agent.slice(0, 300),
    ip: req.ip?.slice(0, 80) ?? null,
  };
}

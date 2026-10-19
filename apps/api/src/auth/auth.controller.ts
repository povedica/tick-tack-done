import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from './auth-user';
import { LoginDto, RegisterDto, SessionListItemDto, SessionResponseDto } from './auth.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from './current-user.decorator';
import { Authenticated, Public } from './scopes.decorator';
import { SESSION_COOKIE, sessionCookieOptions } from './session-cookie';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}

  @Post('register')
  @Public()
  @ApiOperation({
    summary:
      'Create the account and a session. Closed after the first user unless REGISTRATION_OPEN.',
  })
  @ApiOkResponse({ type: SessionResponseDto })
  async register(
    @Body() dto: RegisterDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const issued = await this.auth.register(dto, meta(req));
    setSessionCookie(res, issued.token);
    return issued.body;
  }

  @Post('login')
  @Public()
  @HttpCode(200)
  @ApiOperation({ summary: 'Open a revocable httpOnly session and return the CSRF token' })
  @ApiOkResponse({ type: SessionResponseDto })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<SessionResponseDto> {
    const issued = await this.auth.login(dto, meta(req));
    setSessionCookie(res, issued.token);
    return issued.body;
  }

  @Post('logout')
  @HttpCode(204)
  @Authenticated()
  @ApiOperation({ summary: 'Revoke the current session' })
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(user);
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions());
  }

  @Get('session')
  @Authenticated()
  @ApiOperation({ summary: 'Current session profile and CSRF token' })
  @ApiOkResponse({ type: SessionResponseDto })
  current(@CurrentUser() user: AuthUser, @Req() req: Request): Promise<SessionResponseDto> {
    return this.auth.profile(user, csrfOf(req));
  }

  @Get('sessions')
  @Authenticated()
  @ApiOperation({ summary: 'Revocable sessions of the current user' })
  @ApiOkResponse({ type: SessionListItemDto, isArray: true })
  list(@CurrentUser() user: AuthUser): Promise<SessionListItemDto[]> {
    return this.auth.list(user);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @Authenticated()
  @ApiOperation({ summary: 'Revoke one session immediately' })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.auth.revoke(user, id);
  }
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE, token, sessionCookieOptions());
}

function meta(req: Request): { userAgent: string | null; ip: string | null } {
  const agent = req.header('user-agent');
  return {
    userAgent: agent === undefined ? null : agent.slice(0, 300),
    ip: req.ip?.slice(0, 80) ?? null,
  };
}

function csrfOf(req: Request): string {
  const value = (req as Request & { csrfToken?: string }).csrfToken;
  return value ?? '';
}

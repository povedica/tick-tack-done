import {
  GoogleConnectionStatusDto,
  GoogleIntegrationStatusDto,
  GoogleServiceAccessDto,
} from './google-status.dto.js';
import { GOOGLE_ACCESS_SELECT, googleServiceAccess } from '../../integrations/google-access.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  HttpCode,
  Inject,
  Post,
  Patch,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiQuery,
  ApiOperation,
  ApiProperty,
  ApiTags,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import {
  IsBoolean,
  IsBooleanString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';
import type { Request, Response } from 'express';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Public, Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { googleConfigured, telegramConfigured } from '../../integrations/config.js';
import { telegramSecretMatches } from '../../integrations/telegram-secret.js';
import { authorizeUrl, readState, redirectFor, signState } from './google-oauth.js';
import { TelegramBotService } from './telegram-bot.service.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { openField, sealField } from '../../security/field-cipher.js';
import { TasksService } from '../tasks/tasks.service.js';

class TelegramStatusDto {
  @ApiProperty() configured!: boolean;
  @ApiProperty() linked!: boolean;
  @ApiProperty({ type: String, nullable: true }) bot_username!: string | null;
  @ApiProperty({ type: String, nullable: true }) username!: string | null;
  @ApiProperty({ type: String, nullable: true }) display_name!: string | null;
  @ApiProperty({ type: String, nullable: true }) linked_at!: string | null;
  @ApiProperty({ enum: ['not_linked', 'connected', 'blocked'] }) status!: string;
  @ApiProperty() enabled!: boolean;
  @ApiProperty() voice!: boolean;
  @ApiProperty() photo!: boolean;
}
class TelegramPairingResponseDto {
  @ApiProperty() code!: string;
  @ApiProperty() expires_at!: string;
  @ApiProperty({ type: String, nullable: true }) bot_username!: string | null;
  @ApiProperty({ type: String, nullable: true }) deep_link!: string | null;
}

class LinkDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  chat_id!: string;
}

class DisconnectGoogleDto {
  @ApiProperty({
    type: Boolean,
    required: false,
    default: false,
    description:
      'Soft-delete imported Google events; existing Drive attachment links are always kept.',
  })
  @IsOptional()
  @IsBooleanString()
  remove_imported_events?: string;
}

class DriveDto {
  @ApiProperty()
  @IsUUID()
  task_id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  file_id!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(2000)
  url!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  copy?: boolean;
}

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(TelegramBotService) private readonly telegram: TelegramBotService,
    @Inject(TasksService) private readonly tasks: TasksService,
  ) {}

  @Get('telegram')
  @ApiOkResponse({ type: TelegramStatusDto })
  @Scopes('profile:read')
  @ApiOperation({
    summary: 'Telegram bot status. Without TELEGRAM_BOT_TOKEN it stays stopped (RF-2003).',
  })
  async status(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const link = await this.prisma.telegramLink.findFirst({
      where: { ownerId: user.id, deletedAt: null },
    });
    const owner = await this.prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { telegramEnabled: true },
    });
    respondJson(
      req,
      res,
      200,
      {
        configured: telegramConfigured(),
        bot_username: await this.telegram.botUsername(),
        username: link?.username ?? null,
        display_name: link?.displayName ?? null,
        linked_at: link?.createdAt.toISOString() ?? null,
        status: link?.status ?? 'not_linked',
        enabled: owner.telegramEnabled,
        voice: telegramConfigured() && present('TELEGRAM_VOICE_PROVIDER'),
        photo: telegramConfigured(),
        linked: link !== null,
      },
      false,
    );
  }

  @Delete('telegram')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Unlink Telegram chats from this account (RF-2003)' })
  async unlinkTelegram(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    const links = await this.prisma.telegramLink.findMany({
      where: { ownerId: user.id, deletedAt: null },
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.telegramLink.updateMany({
        where: { ownerId: user.id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.telegramUnlinked,
        entityType: 'telegram_link',
        entityId: user.id,
        action: 'deleted',
        data: { user: { id: user.id } },
        previous: null,
      });
    });
    for (const link of links) await this.telegram.farewell(link.chatId);
    res.status(204).end();
  }

  @Post('telegram/recheck')
  @Scopes('profile:write')
  @ApiOperation({
    summary: 'Check that the linked Telegram bot can send again after being unblocked',
  })
  async recheckTelegram(@CurrentUser() user: AuthUser) {
    return this.telegram.recheck(user);
  }

  @Post('telegram/pairing')
  @ApiCreatedResponse({ type: TelegramPairingResponseDto })
  @Scopes('profile:write')
  @ApiOperation({
    summary:
      'Issue a one-time pairing code. Send /start <code> in Telegram (APP-07a). Does not accept raw chat_id.',
  })
  async pairing(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.telegram.createPairing(user), false);
  }

  @Post('telegram/link')
  @Scopes('profile:write')
  @ApiOperation({
    summary:
      'Deprecated: linking by raw chat_id is refused. Use POST /integrations/telegram/pairing (APP-07a).',
  })
  link(
    @CurrentUser() _user: AuthUser,
    @Body() _dto: LinkDto,
    @Req() _req: Request,
    @Res() _res: Response,
  ): void {
    throw new DomainException(
      HttpStatus.GONE,
      'telegram_pairing_required',
      'Vincula el chat con un código de un solo uso desde Ajustes. No se acepta chat_id directo.',
    );
  }

  @Post('telegram/webhook')
  @Public()
  @ApiOperation({
    summary:
      'Inbound Telegram update. Creates the task and replies in the chat (RF-2003). Refuses to run when the bot token is missing.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      additionalProperties: true,
      description: 'Telegram Update: message text, voice, photo, or callback_query.',
    },
  })
  async webhook(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (!telegramConfigured()) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'telegram_not_configured',
        'Set TELEGRAM_BOT_TOKEN. The bot is not calling Telegram.',
      );
    }
    if (!telegramSecretMatches(req.header('x-telegram-bot-api-secret-token'))) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid bot secret');
    }
    respondJson(req, res, 200, await this.telegram.handle(req.body), false);
  }

  @Get('google')
  @ApiOkResponse({ type: GoogleConnectionStatusDto })
  @Scopes('profile:read')
  @ApiOperation({
    summary: 'Google connection status. The refresh token is stored after consent (RF-2004).',
  })
  async google(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { ...GOOGLE_ACCESS_SELECT, googleAccountEmail: true },
    });
    respondJson(
      req,
      res,
      200,
      {
        configured: googleConfigured(),
        ...googleServiceAccess(row, 'calendar'),
        account: row?.googleAccountEmail ?? null,
        has_connection: !!row?.googleRefreshToken,
        connection_status: row?.googleStatus ?? 'disconnected',
        services: {
          calendar: googleServiceAccess(row, 'calendar'),
          drive: googleServiceAccess(row, 'drive'),
        },
      },
      false,
    );
  }

  @Delete('google')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Scopes('profile:write')
  @ApiOperation({
    summary:
      'Disconnect and revoke all Google services; keep imported events unless explicitly requested (RF-2004)',
  })
  async disconnectGoogle(
    @CurrentUser() user: AuthUser,
    @Res() res: Response,
    @Query() dto: DisconnectGoogleDto = {},
  ): Promise<void> {
    if (
      dto.remove_imported_events !== undefined &&
      dto.remove_imported_events !== 'true' &&
      dto.remove_imported_events !== 'false'
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'remove_imported_events must be true or false',
      );
    }
    const credential = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { googleRefreshToken: true },
    });
    let revoked = false;
    if (credential?.googleRefreshToken) {
      try {
        const response = await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: openField(credential.googleRefreshToken) }),
          signal: AbortSignal.timeout(5000),
        });
        revoked = response.ok || response.status === 400;
      } catch {
        /* Local disconnect remains available when Google cannot be reached. */
      }
    }
    if (credential?.googleRefreshToken && !revoked)
      throw new DomainException(
        503,
        'google_revoke_failed',
        'Google could not confirm revocation; retry later',
      );
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          googleRefreshToken: null,
          googleAccountEmail: null,
          googleStatus: 'disconnected',
          googleGrantedScopes: [],
        },
      });
      if (dto.remove_imported_events === 'true')
        await tx.externalEvent.updateMany({
          where: { ownerId: user.id, deletedAt: null, subscription: { provider: 'google' } },
          data: { deletedAt: new Date() },
        });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.googleDisconnected,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: {
          google: {
            connected: false,
            revocation_requested: !!credential?.googleRefreshToken,
            revoked,
            imported_events_removed: dto.remove_imported_events === 'true',
          },
        },
        previous: null,
      });
    });
    res.status(204).end();
  }

  @Get('google/start')
  @Scopes('profile:write')
  @ApiOperation({
    summary: 'Request Calendar, Drive or both using incremental Google consent (RF-2004/2005).',
  })
  @ApiQuery({ name: 'service', required: false, enum: ['calendar', 'drive', 'all'] })
  start(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
    @Query('service') requested?: string,
  ): void {
    if (
      requested !== undefined &&
      requested !== 'calendar' &&
      requested !== 'drive' &&
      requested !== 'all'
    )
      throw new DomainException(400, 'validation_failed', 'service must be calendar, drive or all');
    if (!googleConfigured())
      throw new DomainException(
        503,
        'google_not_configured',
        'Configure Google OAuth before connecting',
      );
    const redirect = redirectFor(pageOrigin(req));
    if (!redirect)
      throw new DomainException(
        400,
        'validation_failed',
        'Open settings on the app origin before connecting Google',
      );
    const product = requested ?? 'all';
    const state = signState({
      uid: user.id,
      exp: Date.now() + 10 * 60 * 1000,
      redirect,
      requested: product,
    });
    respondJson(req, res, 200, { url: authorizeUrl(redirect, state, product) }, false);
  }

  @Get('google/callback')
  @Public()
  @ApiOperation({
    summary: 'Google OAuth callback; persist only actually granted scopes (RF-2004/2005).',
  })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = state === undefined ? null : readState(state);
    const fallback = (
      process.env.APP_WEB_URL ??
      process.env.PUBLIC_URL ??
      'http://127.0.0.1:5173'
    ).replace(/\/$/, '');
    const back = parsed === null ? fallback : parsed.redirect.replace(/\/api\/v1.*$/, '');
    if (oauthError === 'access_denied') {
      res.redirect(302, `${back}/settings/integrations?google=denied`);
      return;
    }
    if (parsed === null || typeof code !== 'string' || code.length === 0) {
      res.redirect(302, `${back}/settings/integrations?google=error`);
      return;
    }
    const token = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID ?? '',
        client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
        redirect_uri: parsed.redirect,
        grant_type: 'authorization_code',
      }),
      signal: AbortSignal.timeout(8_000),
    });
    const body = (await token.json()) as {
      access_token?: unknown;
      refresh_token?: unknown;
      scope?: unknown;
    };
    if (!token.ok || typeof body.access_token !== 'string') {
      res.redirect(302, `${back}/settings/integrations?google=error`);
      return;
    }
    const existing = await this.prisma.user.findUniqueOrThrow({
      where: { id: parsed.uid },
      select: { googleRefreshToken: true, googleAccountEmail: true },
    });
    const refreshToken =
      typeof body.refresh_token === 'string' && body.refresh_token.length > 0
        ? sealField(body.refresh_token)
        : existing.googleRefreshToken;
    if (!refreshToken) {
      res.redirect(302, `${back}/settings/integrations?google=error`);
      return;
    }
    const scopes =
      typeof body.scope === 'string' ? [...new Set(body.scope.split(/\s+/).filter(Boolean))] : [];
    const account = await googleAccount(
      typeof body.access_token === 'string' ? body.access_token : '',
    );
    if (
      typeof body.refresh_token !== 'string' &&
      (!account || account !== existing.googleAccountEmail)
    ) {
      res.redirect(302, `${back}/settings/integrations?google=error`);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: parsed.uid },
        data: {
          googleRefreshToken: refreshToken,
          googleAccountEmail: account,
          googleStatus: 'connected',
          googleGrantedScopes: scopes,
          ...(parsed.requested === 'drive'
            ? { googleDriveEnabled: true }
            : parsed.requested === 'calendar'
              ? { googleCalendarEnabled: true }
              : { googleDriveEnabled: true, googleCalendarEnabled: true }),
        },
      });
      await this.events.record(
        tx,
        { ownerId: parsed.uid, actorId: parsed.uid, actorKind: 'user', tokenId: null },
        {
          type: DomainEvent.googlePermissionsUpdated,
          entityType: 'user',
          entityId: parsed.uid,
          action: 'updated',
          data: asJson({ provider: 'google', granted_scopes: scopes }),
          previous: null,
        },
      );
    });
    res.redirect(302, `${back}/settings/integrations?google=connected`);
  }

  @Get('drive')
  @ApiOkResponse({ type: GoogleIntegrationStatusDto })
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Google Drive status. No call is made without credentials (RF-2005).' })
  async drive(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { ...GOOGLE_ACCESS_SELECT, googleAccountEmail: true },
    });
    respondJson(
      req,
      res,
      200,
      {
        configured: googleConfigured(),
        ...googleServiceAccess(row, 'drive'),
        account: row?.googleAccountEmail ?? null,
      },
      false,
    );
  }

  @Patch('google/services/:service')
  @Scopes('profile:write')
  @ApiOperation({
    summary:
      'Activate or deactivate Calendar/Drive locally. This does not revoke Google permissions.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['enabled'],
      additionalProperties: false,
      properties: { enabled: { type: 'boolean' } },
    },
  })
  @ApiOkResponse({ type: GoogleServiceAccessDto })
  async setGoogleService(
    @CurrentUser() user: AuthUser,
    @Param('service') service: string,
    @Body() body: { enabled?: unknown },
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (
      (service !== 'calendar' && service !== 'drive') ||
      typeof body.enabled !== 'boolean' ||
      Object.keys(body).some((key) => key !== 'enabled')
    )
      throw new DomainException(
        400,
        'validation_failed',
        'Choose calendar or drive and a boolean enabled',
      );
    const enabled = body.enabled;
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: GOOGLE_ACCESS_SELECT,
      });
      if (enabled && !googleServiceAccess(current, service).authorized)
        throw new DomainException(
          409,
          'google_permission_required',
          'Authorize this service with Google first',
        );
      const updated = await tx.user.update({
        where: { id: user.id },
        data:
          service === 'drive'
            ? { googleDriveEnabled: enabled }
            : { googleCalendarEnabled: enabled },
        select: GOOGLE_ACCESS_SELECT,
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.googleServiceUpdated,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: { service, enabled },
        previous: {
          enabled: service === 'drive' ? current.googleDriveEnabled : current.googleCalendarEnabled,
        },
      });
      return updated;
    });
    respondJson(req, res, 200, googleServiceAccess(row, service), false);
  }

  @Post('drive/attachments')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Attach a Drive file by link. Copying bytes needs credentials (RF-2005).',
  })
  async attach(
    @CurrentUser() user: AuthUser,
    @Body() dto: DriveDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: dto.task_id, ownerId: user.id, deletedAt: null },
    });
    if (task === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    if (dto.copy === true) {
      const copied = await this.copyDriveFile(user, task.id, dto);
      respondJson(req, res, 201, copied, false);
      return;
    }
    const row = await this.tasks.linkDriveFile(user, task.id, dto.file_id);
    respondJson(req, res, 201, { ...row, copied: false }, false);
  }

  private async copyDriveFile(user: AuthUser, taskId: string, dto: DriveDto) {
    return { ...(await this.tasks.linkDriveFile(user, taskId, dto.file_id)), copied: false };
  }
}

function pageOrigin(req: Request): string | undefined {
  const origin = req.header('origin');
  if (origin !== undefined && origin.length > 0) {
    return origin;
  }
  const referer = req.header('referer');
  if (referer === undefined) {
    return undefined;
  }
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}

async function googleAccount(accessToken: string): Promise<string | null> {
  if (accessToken.length === 0) {
    return null;
  }
  const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    return null;
  }
  const body = (await response.json()) as { email?: unknown };
  return typeof body.email === 'string' ? body.email : null;
}

function present(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
}

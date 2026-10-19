import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiBody, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Public, Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { driveConfigured, googleConfigured, telegramConfigured } from '../../integrations/config';
import { downloadDriveFile } from '../../integrations/google-drive';
import { exchangeGoogleRefreshToken } from '../../integrations/google-token';
import { telegramSecretMatches } from '../../integrations/telegram-secret';
import { authorizeUrl, readState, redirectFor, signState } from './google-oauth';
import { TelegramBotService } from './telegram-bot.service';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';
import { openField, sealField } from '../../security/field-cipher';
import { ATTACHMENT_MAX_BYTES } from '../tasks/attachment-storage';
import { TasksService } from '../tasks/tasks.service';

class LinkDto {
  @ApiProperty()
  @IsString()
  @MaxLength(40)
  chat_id!: string;
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
      select: { id: true },
    });
    respondJson(
      req,
      res,
      200,
      {
        configured: telegramConfigured(),
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
    res.status(204).end();
  }

  @Post('telegram/link')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Remember a chat id so the bot can act as this user (RF-2003).' })
  async link(
    @CurrentUser() user: AuthUser,
    @Body() dto: LinkDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.telegramLink.upsert({
        where: { chatId: dto.chat_id },
        create: { ownerId: user.id, chatId: dto.chat_id },
        update: { ownerId: user.id, deletedAt: null },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.telegramLinked,
        entityType: 'telegram_link',
        entityId: saved.id,
        action: 'created',
        data: asJson({ chat_id: dto.chat_id, bot_configured: telegramConfigured() }),
        previous: null,
      });
      return saved;
    });
    respondJson(req, res, 201, { id: row.id, configured: telegramConfigured() }, false);
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
      select: { googleRefreshToken: true, googleAccountEmail: true },
    });
    respondJson(
      req,
      res,
      200,
      {
        configured: googleConfigured(),
        connected: (row?.googleRefreshToken ?? '').length > 0,
        account: row?.googleAccountEmail ?? null,
      },
      false,
    );
  }

  @Delete('google')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Disconnect Google Calendar and Drive (RF-2004)' })
  async disconnectGoogle(@CurrentUser() user: AuthUser, @Res() res: Response): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { googleRefreshToken: null, googleAccountEmail: null },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.googleDisconnected,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: { google: { connected: false } },
        previous: null,
      });
    });
    res.status(204).end();
  }

  @Get('google/start')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Build the Google consent URL. The browser completes it (RF-2004).' })
  start(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): void {
    const redirect = redirectFor(pageOrigin(req));
    if (!googleConfigured()) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'google_not_configured',
        'Google needs GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET',
      );
    }
    if (redirect === null) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Open settings on the app origin before connecting Google',
      );
    }
    const state = signState({ uid: user.id, exp: Date.now() + 10 * 60 * 1000, redirect });
    respondJson(req, res, 200, { url: authorizeUrl(redirect, state) }, false);
  }

  @Get('google/callback')
  @Public()
  @ApiOperation({ summary: 'Google redirects here with the authorization code (RF-2004).' })
  async callback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = state === undefined ? null : readState(state);
    const fallback = (
      process.env.APP_WEB_URL ??
      process.env.PUBLIC_URL ??
      'http://127.0.0.1:5173'
    ).replace(/\/$/, '');
    const back = parsed === null ? fallback : parsed.redirect.replace(/\/api\/v1.*$/, '');
    if (parsed === null || code === undefined || code.length === 0) {
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
    const body = (await token.json()) as { access_token?: unknown; refresh_token?: unknown };
    if (!token.ok || typeof body.refresh_token !== 'string') {
      res.redirect(302, `${back}/settings/integrations?google=error`);
      return;
    }
    const refreshToken = body.refresh_token;
    const account = await googleAccount(
      typeof body.access_token === 'string' ? body.access_token : '',
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: parsed.uid },
        data: { googleRefreshToken: sealField(refreshToken), googleAccountEmail: account },
      });
      await this.events.record(
        tx,
        { ownerId: parsed.uid, actorId: parsed.uid, actorKind: 'user', tokenId: null },
        {
          type: DomainEvent.calendarSubscribed,
          entityType: 'user',
          entityId: parsed.uid,
          action: 'updated',
          data: asJson({ provider: 'google', account }),
          previous: null,
        },
      );
    });
    res.redirect(302, `${back}/settings/integrations?google=connected`);
  }

  @Get('drive')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Google Drive status. No call is made without credentials (RF-2005).' })
  async drive(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { googleRefreshToken: true },
    });
    const googleOn = (row?.googleRefreshToken ?? '').length > 0;
    respondJson(req, res, 200, { configured: googleConfigured(), connected: googleOn }, false);
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
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.attachment.create({
        data: {
          ownerId: user.id,
          taskId: task.id,
          fileName: dto.name,
          mimeType: 'application/vnd.google-apps.drive',
          byteSize: 0,
          storageKey: `${user.id}/${randomUUID()}`,
          driveFileId: dto.file_id,
          driveUrl: dto.url,
          uploadedById: user.id,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.driveAttached,
        entityType: 'attachment',
        entityId: created.id,
        action: 'created',
        data: asJson({
          drive_file_id: dto.file_id,
          copied: false,
          drive_configured: driveConfigured(),
        }),
        previous: null,
      });
      return created;
    });
    respondJson(req, res, 201, { id: row.id, drive_url: dto.url, copied: false }, false);
  }

  private async copyDriveFile(
    user: AuthUser,
    taskId: string,
    dto: DriveDto,
  ): Promise<{ id: string; drive_url: string; copied: true }> {
    const row = await this.prisma.user.findUnique({
      where: { id: user.id },
      select: { googleRefreshToken: true },
    });
    const stored = row?.googleRefreshToken ?? null;
    const refresh =
      stored === null || stored.length === 0
        ? (process.env.GOOGLE_REFRESH_TOKEN ?? '')
        : openField(stored);
    const access = await exchangeGoogleRefreshToken(refresh);
    const file = await downloadDriveFile(access, dto.file_id);
    if (file.bytes.length > ATTACHMENT_MAX_BYTES) {
      throw new DomainException(
        HttpStatus.PAYLOAD_TOO_LARGE,
        'payload_too_large',
        'Drive file exceeds 25 MB',
      );
    }
    const saved = await this.tasks.addAttachment(user, taskId, {
      originalname: dto.name.length > 0 ? dto.name : file.name,
      mimetype: file.mimeType,
      size: file.bytes.length,
      buffer: file.bytes,
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.attachment.update({
        where: { id: saved.id },
        data: { driveFileId: dto.file_id, driveUrl: dto.url },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.driveAttached,
        entityType: 'attachment',
        entityId: saved.id,
        action: 'created',
        data: asJson({
          drive_file_id: dto.file_id,
          copied: true,
          drive_configured: driveConfigured(),
        }),
        previous: null,
      });
    });
    return { id: saved.id, drive_url: dto.url, copied: true };
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

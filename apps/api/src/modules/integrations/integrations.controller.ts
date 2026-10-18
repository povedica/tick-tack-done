import { randomUUID } from 'node:crypto';
import { Body, Controller, Get, HttpStatus, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { parseTelegramCommand } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { driveConfigured, telegramConfigured } from '../../integrations/config';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';

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
}

class TelegramUpdateDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  text?: string;
}

@ApiTags('integrations')
@Controller('integrations')
export class IntegrationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get('telegram')
  @Scopes('profile:read')
  @ApiOperation({
    summary: 'Telegram bot status. Without TELEGRAM_BOT_TOKEN it stays stopped (RF-2003).',
  })
  status(@Req() req: Request, @Res() res: Response): void {
    respondJson(
      req,
      res,
      200,
      {
        configured: telegramConfigured(),
        voice: telegramConfigured() && present('TELEGRAM_VOICE_PROVIDER'),
        photo: telegramConfigured(),
      },
      false,
    );
  }

  @Post('telegram/link')
  @Scopes('profile:write')
  @ApiOperation({
    summary: 'Remember a chat id. The bot still does not call Telegram without a token.',
  })
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
  @ApiOperation({
    summary: 'Inbound Telegram update. Refuses to run when the bot token is missing.',
  })
  webhook(@Body() dto: TelegramUpdateDto, @Req() req: Request, @Res() res: Response): void {
    if (!telegramConfigured()) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'telegram_not_configured',
        'Set TELEGRAM_BOT_TOKEN. The bot is not calling Telegram.',
      );
    }
    if (req.header('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_BOT_TOKEN) {
      throw new DomainException(HttpStatus.UNAUTHORIZED, 'unauthorized', 'Invalid bot secret');
    }
    const command = parseTelegramCommand(dto.text ?? '');
    respondJson(req, res, 200, { command, called_telegram: false }, false);
  }

  @Get('drive')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Google Drive status. No call is made without credentials (RF-2005).' })
  drive(@Req() req: Request, @Res() res: Response): void {
    respondJson(req, res, 200, { configured: driveConfigured() }, false);
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
}

function present(name: string): boolean {
  const value = process.env[name];
  return value !== undefined && value.trim().length > 0;
}

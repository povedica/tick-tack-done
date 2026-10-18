import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import { isReportTone, weeklyNarrative, type ReportTone } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';
import { loadDashboardSnapshot } from '../../reading/snapshot';

class ReportSettingsDto {
  @ApiProperty({ required: false, example: 'sunday' })
  @IsOptional()
  @IsString()
  day?: string;

  @ApiProperty({ required: false, example: '20:00' })
  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  time?: string;

  @ApiProperty({ required: false, enum: ['honesto', 'neutro', 'motivador'] })
  @IsOptional()
  @IsIn(['honesto', 'neutro', 'motivador'])
  tone?: ReportTone;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  channels?: string[];
}

@ApiTags('reports')
@Controller()
export class ReportsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get('reports/weekly')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Weekly report history (RF-2204)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.weeklyReport.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { weekStart: 'desc' },
      take: 20,
    });
    respond(req, res, {
      items: rows.map((row) => ({
        week: row.weekStart.toISOString().slice(0, 10),
        tone: row.tone,
        sent_at: row.sentAt?.toISOString() ?? null,
        payload: row.payload,
      })),
    });
  }

  @Get('reports/weekly/:week')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'One weekly report (RF-2204)' })
  async one(
    @CurrentUser() user: AuthUser,
    @Param('week') week: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.weeklyReport.findFirst({
      where: { ownerId: user.id, weekStart: new Date(`${week}T00:00:00.000Z`), deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'report_not_found', 'Report was not found');
    }
    respond(req, res, { week, tone: row.tone, payload: row.payload, sent_at: row.sentAt });
  }

  @Post('reports/weekly')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Build this week’s honest report (RF-2201, RF-2203)' })
  async build(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const body = await this.compose(user, new Date());
    respond(req, res, body);
  }

  @Get('me/report-settings')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Weekly report settings (RF-2202)' })
  async settings(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.user.findFirst({
      where: { id: user.id },
      select: { weeklyReportSettings: true },
    });
    respond(req, res, normalizeSettings(row?.weeklyReportSettings));
  }

  @Patch('me/report-settings')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Update weekly report settings (RF-2202)' })
  async saveSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReportSettingsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const current = await this.prisma.user.findFirst({
      where: { id: user.id },
      select: { weeklyReportSettings: true },
    });
    const next = { ...normalizeSettings(current?.weeklyReportSettings), ...strip(dto) };
    await this.prisma.user.update({
      where: { id: user.id },
      data: { weeklyReportSettings: asJson(next) },
    });
    respond(req, res, next);
  }

  /** Used by the automation engine. Deterministic text, no model. */
  async compose(user: AuthUser, now: Date) {
    const settings = normalizeSettings(
      (
        await this.prisma.user.findFirst({
          where: { id: user.id },
          select: { weeklyReportSettings: true },
        })
      )?.weeklyReportSettings,
    );
    const snapshot = await loadDashboardSnapshot(this.prisma, user.id, now);
    const focus = await this.prisma.focusSession.aggregate({
      where: {
        ownerId: user.id,
        type: 'focus',
        completed: true,
        startedAt: { gte: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) },
      },
      _sum: { actualSeconds: true },
    });
    const focusMinutes =
      focus._sum.actualSeconds === null ? null : Math.round(focus._sum.actualSeconds / 60);
    const narrative = weeklyNarrative(snapshot, settings.tone, focusMinutes);
    const week = weekStart(now);
    const payload = {
      summary: narrative.summary,
      observations: narrative.observations,
      snapshot,
      weak: narrative.weak,
    };
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.weeklyReport.upsert({
        where: { ownerId_weekStart: { ownerId: user.id, weekStart: week } },
        create: {
          ownerId: user.id,
          weekStart: week,
          payload: asJson(payload),
          tone: settings.tone,
          deliveredChannels: asJson(settings.channels),
        },
        update: { payload: asJson(payload), tone: settings.tone },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.reportGenerated,
        entityType: 'weekly_report',
        entityId: saved.id,
        action: 'created',
        data: { report: { week: week.toISOString().slice(0, 10), tone: settings.tone } },
        previous: null,
      });
      return saved;
    });
    return { id: row.id, week: week.toISOString().slice(0, 10), ...payload, tone: settings.tone };
  }
}

function respond(req: Request, res: Response, body: unknown): void {
  respondJson(req, res, 200, body, false);
}

function strip(dto: ReportSettingsDto): Partial<ReportSettings> {
  return {
    ...(dto.day !== undefined ? { day: dto.day } : {}),
    ...(dto.time !== undefined ? { time: dto.time } : {}),
    ...(dto.tone !== undefined ? { tone: dto.tone } : {}),
    ...(dto.channels !== undefined ? { channels: dto.channels } : {}),
  };
}

interface ReportSettings {
  day: string;
  time: string;
  tone: ReportTone;
  channels: string[];
}

function normalizeSettings(value: unknown): ReportSettings {
  const record =
    typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  const tone =
    typeof record.tone === 'string' && isReportTone(record.tone) ? record.tone : 'honesto';
  return {
    day: typeof record.day === 'string' ? record.day : 'sunday',
    time: typeof record.time === 'string' ? record.time : '20:00',
    tone,
    channels: Array.isArray(record.channels)
      ? record.channels.filter((item): item is string => typeof item === 'string')
      : ['email'],
  };
}

function weekStart(now: Date): Date {
  const day = now.getUTCDay();
  const mondayOffset = day === 0 ? 6 : day - 1;
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset),
  );
  return start;
}

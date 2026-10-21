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
import {
  isReportTone,
  dayKey,
  parseDayBounds,
  addCalendarDays,
  type ReportTone,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { loadDashboardSnapshot } from '../../reading/snapshot.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { bucketWeek } from './week-metrics.js';

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
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  @Get('reports/weekly')
  @Scopes('tasks:read')
  @ApiOperation({
    summary: 'Weekly report history (RF-2204)',
    description:
      'Returns stored payloads unchanged. Legacy reports may use trailing-seven-day totals; clients should derive consistent totals from saved days and disclose legacy coverage. No live recalculation on GET.',
  })
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
    respond(req, res, {
      week,
      tone: row.tone,
      payload: row.payload,
      sent_at: row.sentAt,
    });
  }

  @Post('reports/weekly')
  @Scopes('tasks:read')
  @ApiOperation({
    summary: 'Build this week’s report (RF-2201, RF-2203)',
    description:
      'Explicitly rebuilds the current local Monday–Sunday week through calculated_at. metrics_version=2; completed and created are independent sums of local days. focus_minutes is null without focus records. habits_done/expected cover elapsed days. trend/trend_label are null without a comparable cutoff. Historical reports are unchanged.',
  })
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
    const local = dayKey(now.toISOString(), user.timeZone) ?? now.toISOString().slice(0, 10);
    const weekday = new Date(`${local}T12:00:00Z`).getUTCDay();
    const monday = addCalendarDays(local, -(weekday === 0 ? 6 : weekday - 1)) ?? local;
    const range = parseDayBounds(monday, addCalendarDays(monday, 6) ?? monday, user.timeZone);
    const week = new Date(`${monday}T00:00:00Z`);
    const periodStart = new Date(range?.startIso ?? week.toISOString());
    const snapshot = await loadDashboardSnapshot(this.prisma, user.id, now);
    const focusMinutes = await this.metrics.focusMinutes(user.id, periodStart, now);
    const focusRows = await this.metrics.focusRows(user.id, periodStart, now);
    const habits = await this.metrics.activeHabitsExpectedDays(
      user.id,
      periodStart,
      now,
      user.timeZone,
    );
    const countdowns = await this.prisma.countdown.findMany({
      where: { ownerId: user.id, deletedAt: null, archivedAt: null },
      select: { id: true, title: true, emoji: true, targetDate: true },
    });
    const upcomingCountdowns = countdowns.filter(
      (countdown) =>
        countdown.targetDate >= now &&
        countdown.targetDate <= new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    );
    const reachedCountdowns = countdowns.filter(
      (countdown) =>
        countdown.targetDate >= new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000) &&
        countdown.targetDate < now,
    );
    const closingLine = await this.closingLine(user.id, week);
    const touched = await this.prisma.task.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        OR: [
          { createdAt: { gte: periodStart, lt: now } },
          { completedAt: { gte: periodStart, lt: now } },
        ],
      },
      select: { createdAt: true, completedAt: true },
    });
    const days = bucketWeek(week, touched, user.timeZone, now);
    const completed = days.reduce((sum, day) => sum + day.completed, 0);
    const created = days.reduce((sum, day) => sum + day.created, 0);
    const payload = {
      calculated_at: now.toISOString(),
      time_zone: user.timeZone,
      metrics_version: 2,
      summary: `${String(completed)} tareas completadas y ${String(created)} creadas. ${closingLine}`,
      observations: [],
      snapshot: { ...snapshot, completed, created, trend: null },
      completed,
      created,
      overdue: snapshot.overdue,
      focus_minutes: focusRows.some((session) => session.type === 'focus') ? focusMinutes : null,
      habits_done: habits.done,
      habits_expected: habits.expected,
      trend: null,
      trend_label: null,
      days,
      countdowns: {
        upcoming: upcomingCountdowns.map((countdown) => ({
          id: countdown.id,
          title: countdown.title,
          emoji: countdown.emoji,
        })),
        reached: reachedCountdowns.map((countdown) => ({
          id: countdown.id,
          title: countdown.title,
          emoji: countdown.emoji,
        })),
      },
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

  private async closingLine(ownerId: string, week: Date): Promise<string> {
    const sessions = await this.prisma.planSession.findMany({
      where: {
        ownerId,
        kind: 'shutdown',
        state: 'applied',
        updatedAt: { gte: week, lt: new Date(week.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
      select: { decisions: { select: { decision: true } } },
    });
    const moved = sessions.reduce(
      (sum, session) =>
        sum +
        session.decisions.filter(
          (decision) =>
            decision.decision === 'plan_day' ||
            decision.decision === 'later' ||
            decision.decision === 'someday',
        ).length,
      0,
    );
    return `Cerraste el día ${String(sessions.length)} de 7 días; moviste ${String(moved)} tareas en los cierres.`;
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

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
  weeklyNarrative,
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
      items: await Promise.all(
        rows.map(async (row) => ({
          week: row.weekStart.toISOString().slice(0, 10),
          tone: row.tone,
          sent_at: row.sentAt?.toISOString() ?? null,
          payload: await this.normalizedPayload(
            user,
            row.weekStart.toISOString().slice(0, 10),
            row.payload,
          ),
        })),
      ),
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
      payload: await this.normalizedPayload(user, week, row.payload),
      sent_at: row.sentAt,
    });
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
    const local = dayKey(now.toISOString(), user.timeZone) ?? now.toISOString().slice(0, 10);
    const weekday = new Date(`${local}T12:00:00Z`).getUTCDay();
    const monday = addCalendarDays(local, -(weekday === 0 ? 6 : weekday - 1)) ?? local;
    const range = parseDayBounds(monday, addCalendarDays(monday, 6) ?? monday, user.timeZone);
    const week = new Date(`${monday}T00:00:00Z`);
    const periodStart = new Date(range?.startIso ?? week.toISOString());
    const weekEnd = new Date(range?.endIso ?? week.toISOString());
    const snapshot = await loadDashboardSnapshot(this.prisma, user.id, now);
    const focusMinutes = await this.metrics.focusMinutes(user.id, periodStart, weekEnd);
    const habits = await this.metrics.activeHabitsExpectedDays(
      user.id,
      periodStart,
      weekEnd,
      user.timeZone,
    );
    const upcomingExternal = await this.prisma.externalEvent.count({
      where: {
        ownerId: user.id,
        deletedAt: null,
        startsAt: { gte: now, lt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        subscription: { deletedAt: null, visible: true },
      },
    });
    const narrative = weeklyNarrative(
      { ...snapshot, habit_percent: habits.percent },
      settings.tone,
      focusMinutes,
      upcomingExternal,
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
          { createdAt: { gte: periodStart, lt: weekEnd } },
          { completedAt: { gte: periodStart, lt: weekEnd } },
        ],
      },
      select: { createdAt: true, completedAt: true },
    });
    const payload = {
      summary: `${narrative.summary}\n${closingLine}`,
      observations: narrative.observations,
      snapshot,
      completed: snapshot.completed,
      created: snapshot.created,
      overdue: snapshot.overdue,
      focus_minutes: focusMinutes,
      habits_done: habits.done,
      habits_expected: habits.expected,
      trend: snapshot.trend,
      trend_label:
        snapshot.trend === 0
          ? 'igual que la semana anterior'
          : snapshot.trend > 0
            ? `+${String(snapshot.trend)} vs semana anterior`
            : `${String(snapshot.trend)} vs semana anterior`,
      days: bucketWeek(week, touched),
      weak: narrative.weak,
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

  private async normalizedPayload(user: AuthUser, week: string, payload: unknown) {
    const base =
      typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>) : {};
    const bounds = parseDayBounds(week, addCalendarDays(week, 6) ?? week, user.timeZone);
    if (bounds === null) return base;
    const from = new Date(bounds.startIso);
    const to = new Date(bounds.endIso);
    const [focus, habits] = await Promise.all([
      this.metrics.focusMinutes(user.id, from, to),
      this.metrics.activeHabitsExpectedDays(user.id, from, to, user.timeZone),
    ]);
    const summary =
      typeof base.summary === 'string'
        ? base.summary
            .replace(
              /Tiempo de foco: [\d.,]+ minutos\./,
              `Tiempo de foco: ${String(focus)} minutos.`,
            )
            .replace(
              /Hábitos de hoy: [\d.,]+ %\./,
              `Hábitos de la semana: ${String(habits.percent)} %.`,
            )
        : '';
    const trend = typeof base.trend === 'number' ? base.trend : 0;
    return {
      ...base,
      summary,
      focus_minutes: focus,
      habits_done: habits.done,
      habits_expected: habits.expected,
      trend_label:
        trend === 0
          ? 'igual que la semana anterior'
          : `${trend > 0 ? '+' : ''}${String(trend)} vs semana anterior`,
    };
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

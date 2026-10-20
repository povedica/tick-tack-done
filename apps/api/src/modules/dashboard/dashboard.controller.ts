import { Body, Controller, Get, Inject, Patch, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { loadDashboardSnapshot } from '../../reading/snapshot.js';
import {
  driveConfigured,
  googleConfigured,
  telegramConfigured,
} from '../../integrations/config.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { dayKey, parseDayBounds } from '@reflexionia/domain';

export const WIDGET_KEYS = [
  'completed_today',
  'completed_week',
  'overdue',
  'next_7_days',
  'flow',
  'habits',
  'load',
  'calendar',
  'integrations',
  'focus',
  'next_countdowns',
] as const;

const DEFAULT_LAYOUT = WIDGET_KEYS.map((key, index) => ({
  widget_key: key,
  position: index,
  size: 'm',
  config: {},
}));

class LayoutDto {
  @ApiProperty()
  @IsString()
  @MaxLength(80)
  name!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;

  @ApiProperty({ type: 'array' })
  @IsArray()
  widgets!: unknown[];
}

@ApiTags('dashboard')
@Controller()
export class DashboardController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(MetricsService) private readonly metrics: MetricsService,
  ) {}

  @Get('dashboard/widgets')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Widget catalog (RF-2101, RF-2104)' })
  widgets(@Req() req: Request, @Res() res: Response): void {
    respondJson(
      req,
      res,
      200,
      {
        items: WIDGET_KEYS.map((key) => ({
          key,
          title: key,
          focus_waits: key === 'focus',
        })),
      },
      true,
    );
  }

  @Get('dashboard/data')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'KPI for one widget (RF-2102, RF-2104)' })
  async data(
    @CurrentUser() user: AuthUser,
    @Query('widget') widget: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const now = new Date();
    const snapshot = await loadDashboardSnapshot(this.prisma, user.id, now);
    const tz = user.timeZone || 'Europe/Madrid';
    const today = dayKey(now.toISOString(), tz) ?? now.toISOString().slice(0, 10);
    const todayBounds = parseDayBounds(today, today, tz);
    const focusSeconds =
      todayBounds === null
        ? 0
        : (await this.metrics.focusMinutes(
            user.id,
            new Date(todayBounds.startIso),
            new Date(todayBounds.endIso),
          )) * 60;
    const upcoming = await this.prisma.externalEvent.count({
      where: { ownerId: user.id, deletedAt: null, startsAt: { gte: now } },
    });
    const countdowns = await this.prisma.countdown.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        archivedAt: null,
        targetDate: { gte: now },
      },
      orderBy: { targetDate: 'asc' },
      take: 3,
      select: { id: true, title: true, emoji: true, targetDate: true },
    });
    const values: Record<string, unknown> = {
      completed_today: snapshot.completed_today,
      completed_week: {
        value: snapshot.completed_week,
        trend: snapshot.trend,
        trend_label:
          snapshot.trend === 0
            ? 'igual que la semana anterior'
            : snapshot.trend > 0
              ? `+${String(snapshot.trend)} vs semana anterior`
              : `${String(snapshot.trend)} vs semana anterior`,
      },
      overdue: snapshot.overdue,
      next_7_days: snapshot.next_7_days,
      flow: { created: snapshot.created, completed: snapshot.completed, net: snapshot.net },
      habits: { percent: snapshot.habit_percent },
      load: { by_list: snapshot.by_list, by_tag: snapshot.by_tag },
      calendar: { upcoming, label: `${String(upcoming)} próximos eventos` },
      integrations: {
        telegram: telegramConfigured(),
        google: googleConfigured(),
        drive: driveConfigured(),
      },
      focus: { seconds: focusSeconds },
      next_countdowns: {
        items: countdowns.map((countdown) => ({
          id: countdown.id,
          title: countdown.title,
          emoji: countdown.emoji,
          target_date: countdown.targetDate.toISOString().slice(0, 10),
        })),
      },
    };
    if (widget === undefined || widget.length === 0) {
      respondJson(req, res, 200, { widgets: values }, false);
      return;
    }
    respondJson(req, res, 200, { widget, data: values[widget] ?? null }, false);
  }

  @Get('me/dashboard')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Dashboard layout (RF-2103)' })
  async getLayout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.dashboardLayout.findFirst({
      where: { ownerId: user.id, deletedAt: null, isDefault: true },
    });
    respondJson(
      req,
      res,
      200,
      row === null
        ? { name: 'hoy', is_default: true, widgets: DEFAULT_LAYOUT }
        : { id: row.id, name: row.name, is_default: row.isDefault, widgets: row.widgets },
      false,
    );
  }

  @Patch('me/dashboard')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Save the dashboard layout (RF-2103)' })
  async saveLayout(
    @CurrentUser() user: AuthUser,
    @Body() dto: LayoutDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const current = await this.prisma.dashboardLayout.findFirst({
      where: { ownerId: user.id, deletedAt: null, isDefault: true },
    });
    const row = await this.prisma.$transaction(async (tx) => {
      const saved =
        current === null
          ? await tx.dashboardLayout.create({
              data: {
                ownerId: user.id,
                name: dto.name,
                widgets: asJson(dto.widgets),
                isDefault: dto.is_default ?? true,
              },
            })
          : await tx.dashboardLayout.update({
              where: { id: current.id },
              data: {
                name: dto.name,
                widgets: asJson(dto.widgets),
                isDefault: dto.is_default ?? true,
              },
            });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.dashboardUpdated,
        entityType: 'dashboard_layout',
        entityId: saved.id,
        action: 'updated',
        data: { layout: { id: saved.id, name: saved.name } },
        previous: null,
      });
      return saved;
    });
    respondJson(req, res, 200, { id: row.id, name: row.name, widgets: row.widgets }, false);
  }
}

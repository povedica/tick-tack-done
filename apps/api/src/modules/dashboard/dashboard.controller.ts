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
import { loadGardenProjects } from '../../reading/garden-projects.js';
import { listOverdueTaskRows } from '../../reading/overdue.js';
import {
  driveConfigured,
  googleConfigured,
  telegramConfigured,
} from '../../integrations/config.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { dayKey, parseDayBounds, overdueAgeGroups } from '@reflexionia/domain';

export const WIDGET_KEYS = [
  'completed_today',
  'completed_week',
  'overdue',
  'next_7_days',
  'projects',
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
  size: key === 'projects' ? 'l' : index < 4 ? 's' : 'm',
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
  @ApiOperation({
    summary: 'KPI for one widget (RF-2102, RF-2104)',
    description:
      'Without widget, returns widgets, generated_at and period (from, to, time_zone). Activity covers the trailing seven days; completed_today uses the account time zone. Habits include total active habits. Calendar includes up to three events within the next seven days. Integration booleans reflect the authenticated account connection, not only server configuration. Includes overdue_by_list with disjoint calendar-age buckets under_7, days_7_30 and over_30, based on the same canonical overdue set as the count. Habits, calendar and next_countdowns expose configured independently of current activity. Projects exclude the inbox and include open/closed lists plus all accessible soft deletions, seven-day task activity and review signals (no pending tasks or no task changes for 30 days), excluding note lists and closed projects from suggestions.',
  })
  async data(
    @CurrentUser() user: AuthUser,
    @Query('widget') widget: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const now = new Date();
    const tz = user.timeZone || 'Europe/Madrid';
    const snapshot = await loadDashboardSnapshot(this.prisma, user.id, now, tz);
    const projects = await loadGardenProjects(this.prisma, user.id, now);
    const overdueTasks = await listOverdueTaskRows(this.prisma, user.id);
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
    const until = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const eventWhere = {
      ownerId: user.id,
      deletedAt: null,
      status: { not: 'cancelled' },
      subscription: { visible: true, deletedAt: null },
      startsAt: { gte: now, lte: until },
    };
    const [upcoming, upcomingEvents, habitTotal, account, telegramLink] = await Promise.all([
      this.prisma.externalEvent.count({ where: eventWhere }),
      this.prisma.externalEvent.findMany({
        where: eventWhere,
        orderBy: { startsAt: 'asc' },
        take: 3,
        select: { id: true, title: true, startsAt: true },
      }),
      this.prisma.habit.count({ where: { ownerId: user.id, deletedAt: null, archived: false } }),
      this.prisma.user.findUniqueOrThrow({
        where: { id: user.id },
        select: { googleRefreshToken: true, telegramEnabled: true },
      }),
      this.prisma.telegramLink.findFirst({
        where: { ownerId: user.id, deletedAt: null },
        select: { id: true },
      }),
    ]);
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
    const [configuredHabits, configuredCalendars, configuredCountdowns] = await Promise.all([
      this.prisma.habit.count({ where: { ownerId: user.id, deletedAt: null } }),
      this.prisma.calendarSubscription.count({ where: { ownerId: user.id, deletedAt: null } }),
      this.prisma.countdown.count({ where: { ownerId: user.id, deletedAt: null } }),
    ]);
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
      overdue: overdueTasks.length,
      overdue_by_list: overdueAgeGroups(overdueTasks),
      projects,
      next_7_days: snapshot.next_7_days,
      flow: { created: snapshot.created, completed: snapshot.completed, net: snapshot.net },
      habits: {
        percent: snapshot.habit_percent,
        total: habitTotal,
        configured: configuredHabits > 0,
      },
      load: { by_list: snapshot.by_list, by_tag: snapshot.by_tag },
      calendar: {
        configured: configuredCalendars > 0 || account.googleRefreshToken !== null,
        upcoming,
        label: `${String(upcoming)} eventos en los próximos 7 días`,
        items: upcomingEvents.map((event) => ({
          id: event.id,
          title: event.title,
          starts_at: event.startsAt.toISOString(),
          starts_on: dayKey(event.startsAt.toISOString(), tz),
        })),
      },
      integrations: {
        telegram: telegramConfigured() && account.telegramEnabled && telegramLink !== null,
        google: googleConfigured() && account.googleRefreshToken !== null,
        drive: driveConfigured() && account.googleRefreshToken !== null,
      },
      focus: { seconds: focusSeconds },
      next_countdowns: {
        configured: configuredCountdowns > 0,
        items: countdowns.map((countdown) => ({
          id: countdown.id,
          title: countdown.title,
          emoji: countdown.emoji,
          target_date: countdown.targetDate.toISOString().slice(0, 10),
        })),
      },
    };
    if (widget === undefined || widget.length === 0) {
      respondJson(
        req,
        res,
        200,
        {
          widgets: values,
          generated_at: now.toISOString(),
          period: {
            from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
            to: now.toISOString(),
            time_zone: tz,
          },
        },
        false,
      );
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

import { Body, Controller, Get, Inject, Patch, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';
import { loadDashboardSnapshot } from '../../reading/snapshot';
import { driveConfigured, googleConfigured, telegramConfigured } from '../../integrations/config';

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
    const snapshot = await loadDashboardSnapshot(this.prisma, user.id, new Date());
    const focus = await this.prisma.focusSession.aggregate({
      where: { ownerId: user.id, deletedAt: null, type: 'focus', completed: true },
      _sum: { actualSeconds: true },
    });
    const upcoming = await this.prisma.externalEvent.count({
      where: { ownerId: user.id, deletedAt: null, startsAt: { gte: new Date() } },
    });
    const values: Record<string, unknown> = {
      completed_today: snapshot.completed_today,
      completed_week: { value: snapshot.completed_week, trend: snapshot.trend },
      overdue: snapshot.overdue,
      next_7_days: snapshot.next_7_days,
      flow: { created: snapshot.created, completed: snapshot.completed, net: snapshot.net },
      habits: { percent: snapshot.habit_percent },
      load: { by_list: snapshot.by_list, by_tag: snapshot.by_tag },
      calendar: { upcoming },
      integrations: {
        telegram: telegramConfigured(),
        google: googleConfigured(),
        drive: driveConfigured(),
      },
      focus: { seconds: focus._sum.actualSeconds ?? 0 },
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

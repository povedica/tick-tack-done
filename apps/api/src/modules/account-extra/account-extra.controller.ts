import { Body, Controller, Get, Inject, Patch, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsNumber, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import { achievementScore, insideGeofence, readGeofence } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { loadDashboardSnapshot } from '../../reading/snapshot.js';

class LocationDto {
  @ApiProperty()
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @ApiProperty()
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;
}

class AchievementsDto {
  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;
}

@ApiTags('me')
@Controller('me')
export class LocationController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Post('location')
  @Scopes('reminders:write')
  @ApiOperation({
    summary: 'Fire location reminders when the browser supplies a position (RF-806)',
  })
  async check(
    @CurrentUser() user: AuthUser,
    @Body() dto: LocationDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const reminders = await this.prisma.reminder.findMany({
      where: {
        ownerId: user.id,
        type: 'location',
        deletedAt: null,
        task: { status: 'active', deletedAt: null },
      },
    });
    const fired: string[] = [];
    const day = new Date().toISOString().slice(0, 10);
    for (const reminder of reminders) {
      const fence = readGeofence(reminder.location);
      if (fence === null || !insideGeofence({ lat: dto.lat, lon: dto.lon }, fence)) {
        continue;
      }
      const dedupeKey = `location:${reminder.id}:${day}`;
      const existing = await this.prisma.reminderDelivery.findUnique({ where: { dedupeKey } });
      if (existing !== null) {
        continue;
      }
      await this.prisma.$transaction(async (tx) => {
        const delivery = await tx.reminderDelivery.create({
          data: {
            ownerId: user.id,
            reminderId: reminder.id,
            taskId: reminder.taskId,
            dedupeKey,
            fireAt: new Date(),
            channel: reminder.channel,
            status: 'fired',
            kind: 'task',
            firedAt: new Date(),
            payload: asJson({
              title: 'Recordatorio de lugar',
              body: 'Estás en la zona del recordatorio',
            }),
          },
        });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.reminderFired,
          entityType: 'reminder',
          entityId: reminder.id,
          action: 'updated',
          data: asJson({ delivery_id: delivery.id, kind: 'location', task_id: reminder.taskId }),
          previous: null,
        });
      });
      fired.push(reminder.id);
    }
    respondJson(req, res, 200, { gps: true, checked: reminders.length, fired }, false);
  }
}

@ApiTags('me')
@Controller('me/achievements')
export class AchievementsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get()
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Achievement score from the dashboard KPIs (RF-1602). Off means null.' })
  async read(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.score(user.id), false);
  }

  @Patch()
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Turn the achievement score on or off (RF-1602)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: AchievementsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: user.id }, data: { achievementsEnabled: dto.enabled } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.achievementUpdated,
        entityType: 'user',
        entityId: user.id,
        action: 'updated',
        data: asJson({ enabled: dto.enabled }),
        previous: null,
      });
    });
    respondJson(req, res, 200, await this.score(user.id), false);
  }

  private async score(ownerId: string): Promise<unknown> {
    const row = await this.prisma.user.findFirst({
      where: { id: ownerId },
      select: { achievementsEnabled: true },
    });
    if (row === null) {
      return achievementScore({ enabled: false, completedWeek: 0, habitPercent: 0, focusDays: 0 });
    }
    const snapshot = await loadDashboardSnapshot(this.prisma, ownerId, new Date());
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const sessions = await this.prisma.focusSession.findMany({
      where: { ownerId, completed: true, deletedAt: null, startedAt: { gte: since } },
      select: { startedAt: true },
    });
    const days = new Set(sessions.map((session) => session.startedAt.toISOString().slice(0, 10)));
    return achievementScore({
      enabled: row.achievementsEnabled,
      completedWeek: snapshot.completed_week,
      habitPercent: snapshot.habit_percent,
      focusDays: days.size,
    });
  }
}

import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import {
  cappedFocusSeconds,
  DEFAULT_FOCUS_SETTINGS,
  focusSessionStatus,
  focusStats,
  nextFocusPhase,
  remainingSeconds,
  type FocusListStatus,
  type FocusSessionType,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';

class StartDto {
  @ApiProperty({ required: false, enum: ['focus', 'short_break', 'long_break'] })
  @IsOptional()
  @IsIn(['focus', 'short_break', 'long_break'])
  type?: FocusSessionType;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  task_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  ambient_sound?: string;
}

class SettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  pomodoro_minutes?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  short_break_minutes?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(60)
  long_break_minutes?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  cycles_before_long_break?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  strict_mode?: boolean;
}

class EstimateDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  @Max(50)
  estimated_pomodoros!: number;
}

@ApiTags('focus')
@Controller('focus')
export class FocusController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Post('sessions')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Start a server-side focus session (RF-1201, RF-1205)' })
  async start(
    @CurrentUser() user: AuthUser,
    @Body() dto: StartDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const settings = await this.settingsOf(user.id);
    const type = dto.type ?? 'focus';
    const planned =
      type === 'focus'
        ? settings.pomodoroMinutes
        : type === 'short_break'
          ? settings.shortBreakMinutes
          : settings.longBreakMinutes;
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.focusSession.create({
        data: {
          ownerId: user.id,
          taskId: dto.task_id ?? null,
          type,
          plannedMinutes: planned,
          startedAt: new Date(),
          ambientSound: dto.ambient_sound ?? null,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.focusSessionStarted,
        entityType: 'focus_session',
        entityId: created.id,
        action: 'created',
        data: { session: { id: created.id, type, planned_minutes: planned } },
        previous: null,
      });
      return created;
    });
    respondJson(req, res, 201, this.json(row, new Date()), false);
  }

  @Post('sessions/:id/finish')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Finish a session and name the next phase (RF-1201)' })
  async finish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.close(user, id, true), false);
  }

  @Post('sessions/:id/abort')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Abort a session (RF-1205)' })
  async abort(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.close(user, id, false), false);
  }

  @Get('sessions')
  @Scopes('focus:read')
  @ApiOperation({ summary: 'List focus sessions (RF-1204)' })
  @ApiQuery({ name: 'status', required: false, enum: ['active', 'completed', 'aborted'] })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const filter = sessionFilter(status);
    const now = new Date();
    const rows = await this.prisma.focusSession.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        ...(from !== undefined && to !== undefined
          ? { startedAt: { gte: new Date(from), lt: new Date(to) } }
          : {}),
        ...(filter === 'completed' ? { completed: true, endedAt: { not: null } } : {}),
        ...(filter === 'aborted' ? { completed: false, endedAt: { not: null } } : {}),
        ...(filter === 'active' ? { endedAt: null } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
    const items = rows
      .map((row) => this.json(row, now))
      .filter((row) => filter === undefined || listedStatus(row, now) === filter);
    respondJson(req, res, 200, { items }, false);
  }

  @Get('stats')
  @Scopes('focus:read')
  @ApiOperation({ summary: 'Focus statistics (RF-1204)' })
  async stats(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.focusSession.findMany({
      where: { ownerId: user.id, deletedAt: null },
      include: {
        task: {
          select: { projectId: true, tags: { select: { tag: { select: { name: true } } } } },
        },
      },
    });
    const stats = focusStats(
      rows.map((row) => ({
        type: row.type,
        startedAt: row.startedAt.toISOString(),
        actualSeconds: row.actualSeconds,
        completed: row.completed,
        listId: row.task?.projectId ?? null,
        tagNames: row.task?.tags.map((link) => link.tag.name) ?? [],
      })),
    );
    respondJson(req, res, 200, stats, false);
  }

  @Get('settings')
  @Scopes('focus:read')
  @ApiOperation({ summary: 'Focus settings (RF-1201)' })
  async getSettings(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const settings = await this.settingsOf(user.id);
    respondJson(req, res, 200, settings, false);
  }

  @Patch('settings')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Update focus settings (RF-1201)' })
  async patchSettings(
    @CurrentUser() user: AuthUser,
    @Body() dto: SettingsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.focusSettings.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        pomodoroMinutes: dto.pomodoro_minutes ?? DEFAULT_FOCUS_SETTINGS.pomodoroMinutes,
        shortBreakMinutes: dto.short_break_minutes ?? DEFAULT_FOCUS_SETTINGS.shortBreakMinutes,
        longBreakMinutes: dto.long_break_minutes ?? DEFAULT_FOCUS_SETTINGS.longBreakMinutes,
        cyclesBeforeLongBreak:
          dto.cycles_before_long_break ?? DEFAULT_FOCUS_SETTINGS.cyclesBeforeLongBreak,
        strictMode: dto.strict_mode ?? false,
      },
      update: {
        ...(dto.pomodoro_minutes !== undefined ? { pomodoroMinutes: dto.pomodoro_minutes } : {}),
        ...(dto.short_break_minutes !== undefined
          ? { shortBreakMinutes: dto.short_break_minutes }
          : {}),
        ...(dto.long_break_minutes !== undefined
          ? { longBreakMinutes: dto.long_break_minutes }
          : {}),
        ...(dto.cycles_before_long_break !== undefined
          ? { cyclesBeforeLongBreak: dto.cycles_before_long_break }
          : {}),
        ...(dto.strict_mode !== undefined ? { strictMode: dto.strict_mode } : {}),
      },
    });
    respondJson(req, res, 200, row, false);
  }

  @Patch('tasks/:taskId/estimate')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Optional pomodoro estimate on a task (RF-1202)' })
  async estimate(
    @CurrentUser() user: AuthUser,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: EstimateDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, ownerId: user.id, deletedAt: null },
    });
    if (task === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    const row = await this.prisma.task.update({
      where: { id: taskId },
      data: { estimatedPomodoros: dto.estimated_pomodoros },
    });
    respondJson(req, res, 200, { id: row.id, estimated_pomodoros: row.estimatedPomodoros }, false);
  }

  private async close(user: AuthUser, id: string, completed: boolean) {
    const current = await this.prisma.focusSession.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (current?.endedAt !== null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'session_not_found', 'Session was not found');
    }
    const now = new Date();
    const actual = cappedFocusSeconds(
      current.startedAt.toISOString(),
      current.plannedMinutes,
      now.toISOString(),
    );
    const finished = await this.prisma.focusSession.count({
      where: { ownerId: user.id, type: 'focus', completed: true, deletedAt: null },
    });
    const settings = await this.settingsOf(user.id);
    const next = completed
      ? nextFocusPhase(current.type, finished + (current.type === 'focus' ? 1 : 0), settings)
      : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.focusSession.update({
        where: { id },
        data: { endedAt: now, actualSeconds: actual, completed },
      });
      await this.events.record(tx, actorOf(user), {
        type: completed ? DomainEvent.focusSessionFinished : DomainEvent.focusSessionAborted,
        entityType: 'focus_session',
        entityId: id,
        action: 'updated',
        data: { session: { id, actual_seconds: actual, completed } },
        previous: null,
      });
      return saved;
    });
    return { ...this.json(row, now), next };
  }

  private async settingsOf(userId: string) {
    const row = await this.prisma.focusSettings.findUnique({ where: { userId } });
    return {
      pomodoroMinutes: row?.pomodoroMinutes ?? DEFAULT_FOCUS_SETTINGS.pomodoroMinutes,
      shortBreakMinutes: row?.shortBreakMinutes ?? DEFAULT_FOCUS_SETTINGS.shortBreakMinutes,
      longBreakMinutes: row?.longBreakMinutes ?? DEFAULT_FOCUS_SETTINGS.longBreakMinutes,
      cyclesBeforeLongBreak:
        row?.cyclesBeforeLongBreak ?? DEFAULT_FOCUS_SETTINGS.cyclesBeforeLongBreak,
    };
  }

  private json(
    row: {
      id: string;
      type: FocusSessionType;
      plannedMinutes: number;
      actualSeconds: number;
      startedAt: Date;
      endedAt: Date | null;
      completed: boolean;
      taskId: string | null;
    },
    now: Date,
  ) {
    return {
      id: row.id,
      type: row.type,
      task_id: row.taskId,
      planned_minutes: row.plannedMinutes,
      actual_seconds: row.actualSeconds,
      started_at: row.startedAt.toISOString(),
      ended_at: row.endedAt?.toISOString() ?? null,
      completed: row.completed,
      remaining_seconds:
        row.endedAt === null
          ? remainingSeconds(row.startedAt.toISOString(), row.plannedMinutes, now.toISOString())
          : 0,
    };
  }
}

function sessionFilter(status: string | undefined): 'active' | 'completed' | 'aborted' | undefined {
  if (status === undefined || status.length === 0) {
    return undefined;
  }
  if (status === 'active' || status === 'completed' || status === 'aborted') {
    return status;
  }
  throw new DomainException(
    HttpStatus.BAD_REQUEST,
    'validation_failed',
    'status must be active, completed or aborted',
  );
}

function listedStatus(
  row: {
    readonly ended_at: string | null;
    readonly completed: boolean;
    readonly started_at: string;
    readonly planned_minutes: number;
  },
  now: Date,
): FocusListStatus {
  return focusSessionStatus({
    endedAt: row.ended_at,
    completed: row.completed,
    startedAt: row.started_at,
    plannedMinutes: row.planned_minutes,
    now: now.toISOString(),
  });
}

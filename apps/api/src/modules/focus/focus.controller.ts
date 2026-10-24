import type { Prisma } from '@prisma/client';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Post,
  Query,
  ValidationPipe,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBody,
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiOkResponse,
} from '@nestjs/swagger';
import {
  IsBoolean,
  isUUID,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  IsDivisibleBy,
} from 'class-validator';
import type { Request, Response } from 'express';
import {
  focusElapsedSeconds,
  autoStartNextPhase,
  DEFAULT_FOCUS_SETTINGS,
  focusSessionStatus,
  focusStats,
  nextFocusPhase,
  type FocusListStatus,
  type FocusSessionType,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { pageLimit } from '../../http/cursor.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';

class StartDto {
  @ApiProperty({ required: false, minimum: 1, maximum: 180 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(180)
  planned_minutes?: number;

  @ApiProperty({ required: false, enum: ['focus', 'short_break', 'long_break', 'stopwatch'] })
  @IsOptional()
  @IsIn(['focus', 'short_break', 'long_break', 'stopwatch'])
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

class FinishDto {
  @ApiProperty({ required: false, maxLength: 2000 })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class SettingsDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsInt()
  @Min(5)
  @IsDivisibleBy(5)
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
  @Min(5)
  @Max(90)
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

  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  auto_start_breaks?: boolean;
  @ApiProperty({ required: false, default: false })
  @IsOptional()
  @IsBoolean()
  auto_start_focus?: boolean;
  @ApiProperty({ required: false, enum: ['none', 'bell', 'chime', 'digital'], default: 'bell' })
  @IsOptional()
  @IsIn(['none', 'bell', 'chime', 'digital'])
  alarm_sound?: string;
  @ApiProperty({ required: false, minimum: 0, maximum: 100, default: 70 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  volume?: number;
  @ApiProperty({ required: false, enum: ['none', 'tick', 'rain', 'white_noise'], default: 'none' })
  @IsOptional()
  @IsIn(['none', 'tick', 'rain', 'white_noise'])
  ambient_sound?: string;
  @ApiProperty({ required: false, minimum: 1, maximum: 20, default: 8 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  daily_goal?: number;
}

class FocusSettingsResponseDto {
  @ApiProperty() pomodoroMinutes!: number;
  @ApiProperty() shortBreakMinutes!: number;
  @ApiProperty() longBreakMinutes!: number;
  @ApiProperty() cyclesBeforeLongBreak!: number;
  @ApiProperty() autoStartBreaks!: boolean;
  @ApiProperty() autoStartFocus!: boolean;
  @ApiProperty({ enum: ['none', 'bell', 'chime', 'digital'] }) alarmSound!: string;
  @ApiProperty() volume!: number;
  @ApiProperty({ enum: ['none', 'tick', 'rain', 'white_noise'] }) ambientSound!: string;
  @ApiProperty() dailyGoal!: number;
  @ApiProperty() strictMode!: boolean;
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
    @Body(
      new ValidationPipe({
        expectedType: StartDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: StartDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const settings = await this.settingsOf(user.id);
    const type = dto.type ?? 'focus';
    const planned =
      type === 'stopwatch'
        ? 0
        : (dto.planned_minutes ??
          (type === 'focus'
            ? settings.pomodoroMinutes
            : type === 'short_break'
              ? settings.shortBreakMinutes
              : settings.longBreakMinutes));
    if (dto.task_id !== undefined) {
      const task = await this.prisma.task.findFirst({
        where: {
          id: dto.task_id,
          ownerId: user.id,
          deletedAt: null,
          ...(user.listIds === null ? {} : { projectId: { in: [...user.listIds] } }),
        },
        select: { id: true },
      });
      if (task === null)
        throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const key = `focus-session:${user.id}`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const candidates = await tx.focusSession.findMany({
        where: { ownerId: user.id, endedAt: null, deletedAt: null },
      });
      const active = candidates.find(
        (candidate) =>
          candidate.type === 'stopwatch' ||
          candidate.pausedAt !== null ||
          (this.json(candidate, new Date()).remaining_seconds ?? 0) > 0,
      );
      if (active !== undefined)
        throw new DomainException(
          HttpStatus.CONFLICT,
          'focus_already_running',
          'A focus session is already running',
          { session_id: active.id },
        );
      const created = await tx.focusSession.create({
        include: { task: { select: { id: true, title: true } } },
        data: {
          ownerId: user.id,
          taskId: dto.task_id ?? null,
          type,
          plannedMinutes: planned,
          startedAt: new Date(),
          ambientSound: dto.ambient_sound ?? settings.ambientSound,
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
  @ApiBody({ type: FinishDto, required: false })
  async finish(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(
      new ValidationPipe({
        expectedType: FinishDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: FinishDto | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.close(user, id, true, dto?.note), false);
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

  @Post('sessions/:id/pause')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Pause a running focus session (RF-1205)' })
  async pause(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.setPaused(user, id, true), false);
  }

  @Post('sessions/:id/resume')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Resume a paused focus session (RF-1205)' })
  async resume(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.setPaused(user, id, false), false);
  }

  private async setPaused(user: AuthUser, id: string, pause: boolean) {
    const now = new Date();
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.focusSession.findFirst({
        where: { id, ...sessionAccess(user) },
      });
      if (current === null)
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'session_not_found',
          'Session was not found',
        );
      if (current.endedAt !== null || (current.pausedAt !== null) === pause) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'focus_not_running',
          'Session cannot change pause state',
        );
      }
      const changed = await tx.focusSession.updateMany({
        where: { id, ownerId: user.id, endedAt: null, pausedAt: current.pausedAt },
        data: pause
          ? { pausedAt: now, interruptedCount: { increment: 1 } }
          : {
              pausedAt: null,
              pausedSeconds: {
                increment: Math.max(
                  0,
                  Math.floor(
                    (now.getTime() - (current.pausedAt?.getTime() ?? now.getTime())) / 1000,
                  ),
                ),
              },
            },
      });
      if (changed.count !== 1)
        throw new DomainException(
          HttpStatus.CONFLICT,
          'focus_not_running',
          'Session changed concurrently',
        );
      await this.events.record(tx, actorOf(user), {
        type: pause ? DomainEvent.focusSessionPaused : DomainEvent.focusSessionResumed,
        entityType: 'focus_session',
        entityId: id,
        action: 'updated',
        data: { paused: pause },
        previous: null,
      });
      return tx.focusSession.findUniqueOrThrow({
        where: { id },
        include: { task: { select: { id: true, title: true } } },
      });
    });
    return this.json(row, now);
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
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const filter = sessionFilter(status);
    const limit = pageLimit(limitRaw ?? '30');
    if (cursor !== undefined && !isUUID(cursor))
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid focus cursor',
      );
    const anchor =
      cursor === undefined
        ? null
        : await this.prisma.focusSession.findFirst({
            where: { id: cursor, ownerId: user.id },
            select: { startedAt: true, id: true },
          });
    if (cursor !== undefined && anchor === null)
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid focus cursor',
      );
    if (
      (from !== undefined && !Number.isFinite(Date.parse(from))) ||
      (to !== undefined && !Number.isFinite(Date.parse(to)))
    )
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Invalid date range');
    const now = new Date();
    const rows = await this.prisma.focusSession.findMany({
      where: {
        AND: [sessionAccess(user)],
        ...(anchor === null
          ? {}
          : {
              OR: [
                { startedAt: { lt: anchor.startedAt } },
                { startedAt: anchor.startedAt, id: { lt: anchor.id } },
              ],
            }),
        ...(from !== undefined && to !== undefined
          ? { startedAt: { gte: new Date(from), lt: new Date(to) } }
          : {}),
        ...(filter === 'completed' ? { completed: true, endedAt: { not: null } } : {}),
        ...(filter === 'aborted' ? { completed: false, endedAt: { not: null } } : {}),
        ...(filter === 'active' ? { endedAt: null } : {}),
      },
      include: { task: { select: { id: true, title: true } } },
      orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows
      .slice(0, limit)
      .map((row) => this.json(row, now))
      .filter((row) => filter === undefined || listedStatus(row, now) === filter);
    respondJson(
      req,
      res,
      200,
      { items, next_cursor: rows.length > limit ? (rows[limit - 1]?.id ?? null) : null },
      false,
    );
  }

  @Get('state')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Current owned focus session, settings and daily totals (TTD-AUD-84)' })
  @ApiOkResponse({
    schema: {
      type: 'object',
      required: ['session', 'settings', 'today'],
      properties: {
        session: { type: 'object', nullable: true, additionalProperties: true },
        settings: { type: 'object', additionalProperties: true },
        today: {
          type: 'object',
          properties: { pomos: { type: 'integer' }, minutes: { type: 'number' } },
        },
      },
    },
  })
  async state(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const [rows, settings] = await Promise.all([
      this.prisma.focusSession.findMany({
        where: sessionAccess(user),
        include: { task: { select: { id: true, title: true } } },
        orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
      }),
      this.settingsOf(user.id),
    ]);
    const current = rows.find(
      (session) =>
        session.endedAt === null &&
        (session.type === 'stopwatch' ||
          session.pausedAt !== null ||
          (this.json(session, new Date()).remaining_seconds ?? 0) > 0),
    );
    const stats = focusStats(
      rows.map((row) => ({
        type: row.type,
        startedAt: row.startedAt.toISOString(),
        actualSeconds: row.actualSeconds,
        completed: row.completed,
        listId: null,
        tagNames: [],
      })),
      user.timeZone,
    );
    respondJson(
      req,
      res,
      200,
      {
        session: current ? this.json(current, new Date()) : null,
        settings,
        today: { pomos: stats.today_pomodoros, minutes: stats.today_focus_seconds / 60 },
      },
      false,
    );
  }

  @Get('stats')
  @Scopes('focus:read')
  @ApiOperation({ summary: 'Focus statistics (RF-1204)' })
  async stats(
    @CurrentUser() user: AuthUser,
    @Query('tz') tz: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const timeZone = tz ?? user.timeZone;
    try {
      new Intl.DateTimeFormat('en', { timeZone }).format();
    } catch {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Invalid IANA time zone',
      );
    }
    const rows = await this.prisma.focusSession.findMany({
      where: sessionAccess(user),
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
      timeZone,
    );
    respondJson(req, res, 200, stats, false);
  }

  @Get('settings')
  @Scopes('focus:read')
  @ApiOperation({ summary: 'Focus settings (RF-1201)' })
  @ApiOkResponse({ type: FocusSettingsResponseDto })
  async getSettings(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const settings = await this.settingsOf(user.id);
    respondJson(req, res, 200, settings, false);
  }

  @Put('settings')
  @ApiOkResponse({ type: FocusSettingsResponseDto })
  @Scopes('focus:write')
  @ApiOperation({
    summary: 'Merge focus settings; omitted fields remain unchanged (RF-1201, TTD-AUD-129)',
  })
  async putSettings(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        expectedType: SettingsDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: SettingsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    return this.patchSettings(user, dto, req, res);
  }

  @Patch('settings')
  @Scopes('focus:write')
  @ApiOperation({ summary: 'Update focus settings (RF-1201)' })
  @ApiOkResponse({ type: FocusSettingsResponseDto })
  async patchSettings(
    @CurrentUser() user: AuthUser,
    @Body(
      new ValidationPipe({
        expectedType: SettingsDto,
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    )
    dto: SettingsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.focusSettings.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          autoStartBreaks: dto.auto_start_breaks ?? false,
          autoStartFocus: dto.auto_start_focus ?? false,
          alarmSound: dto.alarm_sound ?? 'bell',
          volume: dto.volume ?? 70,
          ambientSound: dto.ambient_sound ?? 'none',
          dailyGoal: dto.daily_goal ?? 8,
          pomodoroMinutes: dto.pomodoro_minutes ?? DEFAULT_FOCUS_SETTINGS.pomodoroMinutes,
          shortBreakMinutes: dto.short_break_minutes ?? DEFAULT_FOCUS_SETTINGS.shortBreakMinutes,
          longBreakMinutes: dto.long_break_minutes ?? DEFAULT_FOCUS_SETTINGS.longBreakMinutes,
          cyclesBeforeLongBreak:
            dto.cycles_before_long_break ?? DEFAULT_FOCUS_SETTINGS.cyclesBeforeLongBreak,
          strictMode: dto.strict_mode ?? false,
        },
        update: {
          ...(dto.auto_start_breaks === undefined
            ? {}
            : { autoStartBreaks: dto.auto_start_breaks }),
          ...(dto.auto_start_focus === undefined ? {} : { autoStartFocus: dto.auto_start_focus }),
          ...(dto.alarm_sound === undefined ? {} : { alarmSound: dto.alarm_sound }),
          ...(dto.volume === undefined ? {} : { volume: dto.volume }),
          ...(dto.ambient_sound === undefined ? {} : { ambientSound: dto.ambient_sound }),
          ...(dto.daily_goal === undefined ? {} : { dailyGoal: dto.daily_goal }),
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
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.focusSettingsUpdated,
        entityType: 'focus_settings',
        entityId: user.id,
        action: 'updated',
        data: {
          settings: {
            pomodoro_minutes: saved.pomodoroMinutes,
            short_break_minutes: saved.shortBreakMinutes,
            long_break_minutes: saved.longBreakMinutes,
            cycles_before_long_break: saved.cyclesBeforeLongBreak,
            auto_start_breaks: saved.autoStartBreaks,
            auto_start_focus: saved.autoStartFocus,
            alarm_sound: saved.alarmSound,
            volume: saved.volume,
            ambient_sound: saved.ambientSound,
            daily_goal: saved.dailyGoal,
          },
        },
        previous: null,
      });
      return saved;
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

  private async close(user: AuthUser, id: string, completed: boolean, note?: string) {
    const current = await this.prisma.focusSession.findFirst({
      where: { id, ...sessionAccess(user) },
    });
    if (current?.endedAt !== null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'session_not_found', 'Session was not found');
    }
    const now = new Date();
    const elapsed = focusElapsedSeconds({
      startedAt: current.startedAt.toISOString(),
      now: now.toISOString(),
      pausedAt: current.pausedAt?.toISOString() ?? null,
      pausedSeconds: current.pausedSeconds,
    });
    const actual =
      current.type === 'stopwatch' ? elapsed : Math.min(elapsed, current.plannedMinutes * 60);
    const finished = await this.prisma.focusSession.count({
      where: { ownerId: user.id, type: 'focus', completed: true, deletedAt: null },
    });
    const settings = await this.settingsOf(user.id);
    const next = completed
      ? nextFocusPhase(current.type, finished + (current.type === 'focus' ? 1 : 0), settings)
      : null;
    const row = await this.prisma.$transaction(async (tx) => {
      const key = `focus-session:${user.id}`;
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${key}, 0))`;
      const changed = await tx.focusSession.updateMany({
        where: { id, ownerId: user.id, endedAt: null },
        data: { endedAt: now, actualSeconds: actual, completed },
      });
      const saved = await tx.focusSession.findUniqueOrThrow({
        where: { id },
        include: { task: { select: { id: true, title: true } } },
      });
      if (changed.count === 0) return saved;
      await this.events.record(tx, actorOf(user), {
        type: completed ? DomainEvent.focusSessionFinished : DomainEvent.focusSessionAborted,
        entityType: 'focus_session',
        entityId: id,
        action: 'updated',
        data: {
          session: {
            id,
            actual_seconds: actual,
            completed,
            ...(note === undefined ? {} : { note }),
          },
        },
        previous: null,
      });
      if (completed && next && autoStartNextPhase(current.type, settings)) {
        const candidates = await tx.focusSession.findMany({
          where: { ownerId: user.id, endedAt: null, deletedAt: null },
        });
        const running = candidates.some(
          (candidate) =>
            candidate.type === 'stopwatch' ||
            candidate.pausedAt !== null ||
            (this.json(candidate, now).remaining_seconds ?? 0) > 0,
        );
        if (!running) {
          const started = await tx.focusSession.create({
            data: {
              ownerId: user.id,
              type: next.type,
              plannedMinutes: next.plannedMinutes,
              taskId: next.type === 'focus' ? current.taskId : null,
              startedAt: now,
              ambientSound: settings.ambientSound,
            },
          });
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.focusSessionStarted,
            entityType: 'focus_session',
            entityId: started.id,
            action: 'created',
            data: {
              session: {
                id: started.id,
                type: started.type,
                planned_minutes: started.plannedMinutes,
              },
            },
            previous: null,
          });
        }
      }
      return saved;
    });
    return {
      ...this.json(row, now),
      next,
      auto_started: completed && autoStartNextPhase(current.type, settings),
    };
  }

  private async settingsOf(userId: string) {
    const row = await this.prisma.focusSettings.findUnique({ where: { userId } });
    return {
      autoStartBreaks: row?.autoStartBreaks ?? false,
      autoStartFocus: row?.autoStartFocus ?? false,
      alarmSound: row?.alarmSound ?? 'bell',
      volume: row?.volume ?? 70,
      ambientSound: row?.ambientSound ?? 'none',
      dailyGoal: row?.dailyGoal ?? 8,
      strictMode: row?.strictMode ?? false,
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
      pausedAt: Date | null;
      pausedSeconds: number;
      task?: { id: string; title: string } | null;
    },
    now: Date,
  ) {
    return {
      id: row.id,
      type: row.type,
      task_id: row.taskId,
      task: row.task ?? null,
      paused_at: row.pausedAt?.toISOString() ?? null,
      paused_seconds: row.pausedSeconds,
      elapsed_seconds: focusElapsedSeconds({
        startedAt: row.startedAt.toISOString(),
        now: (row.endedAt ?? now).toISOString(),
        pausedAt: row.pausedAt?.toISOString() ?? null,
        pausedSeconds: row.pausedSeconds,
      }),
      planned_minutes: row.plannedMinutes,
      actual_seconds: row.actualSeconds,
      started_at: row.startedAt.toISOString(),
      ended_at: row.endedAt?.toISOString() ?? null,
      completed: row.completed,
      remaining_seconds:
        row.type === 'stopwatch'
          ? null
          : row.endedAt === null
            ? Math.max(
                0,
                row.plannedMinutes * 60 -
                  focusElapsedSeconds({
                    startedAt: row.startedAt.toISOString(),
                    now: now.toISOString(),
                    pausedAt: row.pausedAt?.toISOString() ?? null,
                    pausedSeconds: row.pausedSeconds,
                  }),
              )
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
    readonly paused_at: string | null;
    readonly paused_seconds: number;
    readonly type: FocusSessionType;
  },
  now: Date,
): FocusListStatus {
  if (row.ended_at === null && (row.type === 'stopwatch' || row.paused_at !== null))
    return 'active';
  return focusSessionStatus({
    endedAt: row.ended_at,
    completed: row.completed,
    startedAt: row.started_at,
    plannedMinutes: row.planned_minutes,
    now: new Date(now.getTime() - row.paused_seconds * 1000).toISOString(),
  });
}

function sessionAccess(user: AuthUser): Prisma.FocusSessionWhereInput {
  return {
    ownerId: user.id,
    deletedAt: null,
    ...(user.listIds === null
      ? {}
      : { OR: [{ taskId: null }, { task: { projectId: { in: [...user.listIds] } } }] }),
  };
}

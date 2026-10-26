import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';
import type { Request, Response } from 'express';
import {
  PLAN_ACTIONS,
  storedDecision,
  type PlanningAction,
  type PlanAction,
  type PlanDecisionKind,
  type PlanSources,
} from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { PlanningService } from './planning.service.js';

const DECISIONS = ['done', 'plan_day', 'later', 'cancel', 'trash', 'skip', 'someday'] as const;

class StartPlanDto {
  @ApiProperty({ example: '2026-10-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  local_date!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  time_zone!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  today?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  overdue?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  inbox?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  undated?: boolean;

  @ApiProperty({ required: false, nullable: true, type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  limit?: number | null;
}

class DecisionDto {
  @ApiProperty({ required: false, enum: DECISIONS })
  @IsIn(DECISIONS)
  @IsOptional()
  decision?: PlanDecisionKind;

  @ApiProperty({ required: false, enum: PLAN_ACTIONS })
  @IsOptional()
  @IsIn(PLAN_ACTIONS)
  action?: PlanAction;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  date?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  time?: string;

  @ApiProperty({ required: false, minimum: 5, maximum: 480 })
  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(480)
  duration?: number;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  target_date?: string | null;
}

class ApplyPlanDto {
  @ApiProperty()
  @IsInt()
  @Min(1)
  expected_revision!: number;
}

@ApiTags('planning')
@Controller('planning')
export class PlanningController {
  constructor(@Inject(PlanningService) private readonly planning: PlanningService) {}

  @Get('candidates')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Count candidates without creating a session (F-AC-5)' })
  @ApiQuery({ name: 'date', required: true })
  @ApiQuery({ name: 'inbox', required: false })
  @ApiQuery({ name: 'undated', required: false })
  async candidates(
    @CurrentUser() user: AuthUser,
    @Query('date') date: string,
    @Query('inbox') inbox: string | undefined,
    @Query('undated') undated: string | undefined,
  ) {
    return this.planning.candidates(user, {
      localDate: date,
      timeZone: user.timeZone,
      sources: { today: true, overdue: true, inbox: inbox === 'true', undated: undated === 'true' },
      limit: null,
    });
  }

  @Post('sessions')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Open a day-planning session. Nothing is changed yet.',
    description:
      'Sources can restrict the session to today only. Today includes active start/deadline ranges, excluding overdue tasks when overdue=false. Cards expose start_date and recurring (null for legacy snapshots); clients disable bulk actions when recurrence safety is unknown or recurring=true.',
  })
  async start(
    @CurrentUser() user: AuthUser,
    @Body() body: StartPlanDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const sources: PlanSources = {
      today: body.today ?? true,
      overdue: body.overdue ?? true,
      inbox: body.inbox ?? false,
      undated: body.undated ?? false,
    };
    respondJson(
      req,
      res,
      201,
      await this.planning.start(user, {
        localDate: body.local_date,
        timeZone: body.time_zone,
        sources,
        limit: body.limit ?? null,
      }),
      false,
    );
  }

  @Get('sessions/:id')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Read a planning session and its preview' })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.planning.get(user, id), false);
  }

  @Put('sessions/:id/decisions/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Record one planning decision without changing the task' })
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: DecisionDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (body.action === undefined && body.decision === undefined)
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'action is required');
    const choice: PlanningAction | undefined =
      body.action === undefined
        ? undefined
        : {
            action: body.action,
            ...(body.date === undefined ? {} : { date: body.date }),
            ...(body.time === undefined ? {} : { time: body.time }),
            ...(body.duration === undefined ? {} : { duration: body.duration }),
          };
    respondJson(
      req,
      res,
      200,
      await this.planning.decide(
        user,
        id,
        taskId,
        choice === undefined ? (body.decision ?? 'skip') : storedDecision(choice.action),
        body.target_date ?? null,
        choice,
      ),
      false,
    );
  }

  @Post('sessions/:id/schedule/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Schedule one configured task immediately; keep other decisions in draft',
    description:
      'Requires Idempotency-Key. Returns the updated draft session, committed_task_ids and operation_id for undo. Accepts action=move with date, optional time and duration. Free slots span 00:00–24:00, including weekends.',
  })
  async schedule(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() body: DecisionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (body.action !== 'move' || !body.date)
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'action=move and date are required',
      );
    respondJson(
      req,
      res,
      200,
      await this.planning.schedule(
        user,
        id,
        taskId,
        {
          action: 'move',
          date: body.date,
          ...(body.time === undefined ? {} : { time: body.time }),
          ...(body.duration === undefined ? {} : { duration: body.duration }),
        },
        key,
      ),
      false,
    );
  }

  @Delete('sessions/:id/decisions/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Remove one planning decision' })
  async clear(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.planning.clear(user, id, taskId), false);
  }

  @Post('operations/:id/revert')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Undo an applied day plan; idempotent, 409 if a task changed (F-AC-29)',
  })
  async revert(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.planning.revert(user, id);
  }

  @Post('sessions/:id/apply')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Apply the preview. “La haré hoy” does not change the due date.',
  })
  async apply(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: ApplyPlanDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.planning.apply(user, id, body.expected_revision, key),
      false,
    );
  }
}

@ApiTags('plans')
@Controller('plans')
export class PlansController {
  constructor(@Inject(PlanningService) private readonly planning: PlanningService) {}

  @Get()
  @Scopes('tasks:read')
  @ApiOperation({
    summary: 'Tasks the user planned for a local date',
    description:
      'Includes server-persisted initial_applied_at, last_applied_at and adjustment_count derived from applied plan/replan operations. First save is not an adjustment; later unchanged operations and replays do not count. Shutdown operations are excluded.',
  })
  @ApiQuery({ name: 'date', required: true })
  @ApiQuery({ name: 'time_zone', required: true })
  async day(
    @CurrentUser() user: AuthUser,
    @Query('date') date: string | undefined,
    @Query('time_zone') timeZone: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (date === undefined || timeZone === undefined) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'date and time_zone are required',
      );
    }
    respondJson(req, res, 200, await this.planning.day(user, date, timeZone), false);
  }
}

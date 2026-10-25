import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProperty,
  ApiQuery,
  ApiTags,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import type { Request, Response } from 'express';
import type { PlanDecisionKind } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import { DayClosingService } from './day-closing.service.js';

const DECISIONS = ['done', 'plan_day', 'later', 'someday', 'cancel', 'trash', 'skip'] as const;

class SessionDateDto {
  @ApiProperty({
    required: false,
    description:
      'When false, suggestions remain informational; only explicit decisions are applied. Defaults to true for existing clients.',
  })
  @IsOptional()
  @IsBoolean()
  apply_suggestions?: boolean;

  @ApiProperty({ example: '2026-10-20' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  local_date!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  time_zone!: string;
}

class ClosingDecisionDto {
  @ApiProperty({ enum: DECISIONS })
  @IsIn(DECISIONS)
  decision!: PlanDecisionKind;

  @ApiProperty({ required: false, nullable: true, type: String })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  target_date?: string | null;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  evening?: boolean;
}

class ApplyClosingDto {
  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  expected_revision!: number;
}

class WorkDaysDto {
  @ApiProperty({
    type: [Number],
    description: 'Working weekdays: Sunday=0 through Saturday=6; empty means no working days.',
  })
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  work_days!: number[];
}

@ApiTags('planning')
@Controller('planning')
export class DayClosingController {
  constructor(@Inject(DayClosingService) private readonly closing: DayClosingService) {}

  @Put('settings/work-days')
  @Scopes('profile:write')
  @ApiOperation({ summary: 'Configure working weekdays for day planning (RF-2640)' })
  workDays(@CurrentUser() user: AuthUser, @Body() body: WorkDaysDto) {
    return this.closing.configureWorkDays(user, body.work_days);
  }

  @Get('load')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Day load projection (RF-2641)' })
  @ApiQuery({ name: 'date', required: false })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'days', required: false, type: Number })
  @ApiQuery({ name: 'time_zone', required: true })
  async load(
    @CurrentUser() user: AuthUser,
    @Query('date') date: string,
    @Query('time_zone') timeZone: string,
    @Query('from') from: string | undefined,
    @Query('days') days: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      from !== undefined || days !== undefined
        ? await this.closing.range(user, from ?? date, Number(days ?? 1))
        : await this.closing.load(user, date, timeZone),
      false,
    );
  }

  @Post('shutdown/sessions')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Start the shutdown ritual (RF-2651)' })
  async startShutdown(
    @CurrentUser() user: AuthUser,
    @Body() dto: SessionDateDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      201,
      await this.closing.startShutdown(user, dto.local_date, dto.time_zone),
      false,
    );
  }

  @Put('shutdown/sessions/:id/decisions/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Record a shutdown decision (RF-2651)' })
  async decideShutdown(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ClosingDecisionDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.closing.decide(
        user,
        id,
        taskId,
        dto.decision,
        dto.target_date ?? null,
        dto.evening === true,
      ),
      false,
    );
  }

  @Delete('shutdown/sessions/:id/decisions/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Clear a shutdown decision (RF-2651)' })
  async clearShutdown(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.closing.clear(user, id, taskId), false);
  }

  @Post('shutdown/sessions/:id/apply')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Apply the shutdown (RF-2651)' })
  async applyShutdown(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyClosingDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.closing.apply(user, id, dto.expected_revision, key),
      false,
    );
  }

  @Post('replan/sessions')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Propose a light replan (RF-2670)' })
  async startReplan(
    @CurrentUser() user: AuthUser,
    @Body() dto: SessionDateDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      201,
      await this.closing.startReplan(
        user,
        dto.local_date,
        dto.time_zone,
        dto.apply_suggestions ?? true,
      ),
      false,
    );
  }

  @Delete('replan/sessions/:id')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Discard an owned replan draft without applying decisions (TTD-AUD-85)',
  })
  @ApiNoContentResponse()
  async discardReplan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.closing.discardReplan(user, id);
    res.status(204).end();
  }

  @Put('replan/sessions/:id/decisions/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Override a replan suggestion (RF-2671)' })
  async decideReplan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('taskId', ParseUUIDPipe) taskId: string,
    @Body() dto: ClosingDecisionDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.closing.decide(
        user,
        id,
        taskId,
        dto.decision,
        dto.target_date ?? null,
        dto.evening === true,
      ),
      false,
    );
  }

  @Post('replan/sessions/:id/apply')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Apply a replan (RF-2671)' })
  async applyReplan(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApplyClosingDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.closing.apply(user, id, dto.expected_revision, key),
      false,
    );
  }
}

import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags, ApiOkResponse } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import {
  achievementSchema,
  overviewSchema,
  tasksSchema,
  focusSchema,
  habitsSchema,
} from './stats.schema.js';
import { StatsService, type StatsQuery } from './stats.service.js';

class StatsQueryDto {
  @ApiProperty({ example: '2026-10-13' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  from!: string;

  @ApiProperty({ example: '2026-10-19' })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  to!: string;

  @ApiProperty({ example: 'Europe/Madrid' })
  @IsString()
  tz!: string;

  @ApiProperty({ required: false, description: 'Comma-separated project ids' })
  @IsOptional()
  @IsString()
  list?: string;

  @ApiProperty({ required: false, description: 'Comma-separated tag ids' })
  @IsOptional()
  @IsString()
  tag?: string;

  @ApiProperty({ required: false, description: 'Comma-separated priorities' })
  @IsOptional()
  @IsString()
  @Matches(/^(high|medium|low|none)(,(high|medium|low|none))*$/)
  priority?: string;

  @ApiProperty({ required: false, description: 'Focus session type filter' })
  @IsOptional()
  @IsString()
  @IsIn(['focus', 'short_break', 'long_break'])
  type?: string;

  @ApiProperty({
    required: false,
    description: 'Selected timeline day, independent of the filtered period',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day?: string;

  @ApiProperty({ required: false, enum: ['day', 'week', 'month'] })
  @IsOptional()
  @IsIn(['day', 'week', 'month'])
  group?: string;
}

class ExportQueryDto extends StatsQueryDto {
  @ApiProperty({ enum: ['csv', 'json'] })
  @IsIn(['csv', 'json'])
  format!: 'csv' | 'json';
}

@ApiTags('stats')
@Controller('stats')
export class StatsController {
  constructor(@Inject(StatsService) private readonly stats: StatsService) {}

  @ApiOkResponse({ schema: overviewSchema })
  @Get('overview')
  @Scopes('stats:read')
  @ApiOperation({ summary: 'Statistics overview KPIs and trend (RF-2321)' })
  async overview(
    @CurrentUser() user: AuthUser,
    @Query() query: StatsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.stats.overview(user, asQuery(query)), false);
  }

  @ApiOkResponse({ schema: tasksSchema })
  @Get('tasks')
  @Scopes('stats:read')
  @ApiOperation({ summary: 'Task statistics series and distributions (RF-2321)' })
  async tasks(
    @CurrentUser() user: AuthUser,
    @Query() query: StatsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.stats.tasks(user, asQuery(query)), false);
  }

  @ApiOkResponse({ schema: focusSchema })
  @Get('focus')
  @Scopes('stats:read')
  @ApiOperation({
    summary: 'Focus statistics, heatmap and distribution (RF-2322)',
    description:
      'stats:read grants aggregates. Task titles and per-task distribution require tasks:read; otherwise titles are null and by_task is empty. PAT list restrictions also apply.',
  })
  async focus(
    @CurrentUser() user: AuthUser,
    @Query() query: StatsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.stats.focus(user, asQuery(query)), false);
  }

  @ApiOkResponse({ schema: habitsSchema })
  @Get('habits')
  @Scopes('stats:read')
  @ApiOperation({ summary: 'Habit statistics for the range (RF-2323)' })
  async habits(
    @CurrentUser() user: AuthUser,
    @Query() query: StatsQueryDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.stats.habits(user, asQuery(query)), false);
  }

  @ApiOkResponse({ schema: achievementSchema })
  @Get('achievement')
  @Scopes('stats:read')
  @ApiOperation({ summary: 'Achievement value, level and public formula (RF-2321)' })
  async achievement(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.stats.achievement(user), false);
  }

  @ApiOkResponse({
    content: {
      'text/csv': { schema: { type: 'string' } },
      'application/json': {
        schema: {
          type: 'object',
          properties: {
            overview: overviewSchema,
            tasks: tasksSchema,
            focus: focusSchema,
            habits: habitsSchema,
            from: { type: 'string' },
            to: { type: 'string' },
          },
          required: ['overview', 'tasks', 'focus', 'habits', 'from', 'to'],
        },
      },
    },
  })
  @Get('export')
  @Scopes('stats:read')
  @ApiOperation({ summary: 'Export statistics for the filtered range as CSV or JSON (RF-2324)' })
  async export(
    @CurrentUser() user: AuthUser,
    @Query() query: ExportQueryDto,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.stats.export(user, asQuery(query), query.format);
    res.setHeader('Content-Type', file.content_type);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="stats-${query.from}_${query.to}.${query.format}"`,
    );
    res.status(200).send(file.body);
  }
}

function asQuery(query: StatsQueryDto): StatsQuery {
  return {
    from: query.from,
    to: query.to,
    tz: query.tz,
    ...(query.list !== undefined ? { list: query.list } : {}),
    ...(query.tag !== undefined ? { tag: query.tag } : {}),
    ...(query.priority !== undefined ? { priority: query.priority } : {}),
    ...(query.type !== undefined ? { type: query.type } : {}),
    ...(query.day !== undefined ? { day: query.day } : {}),
    ...(query.group !== undefined ? { group: query.group } : {}),
  };
}

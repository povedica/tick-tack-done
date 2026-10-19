import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { pageLimit } from '../../http/cursor.js';
import { respondJson } from '../../http/respond.js';
import {
  CheckInDto,
  CheckInResponseDto,
  CreateHabitDto,
  HabitPageDto,
  HabitResponseDto,
  HabitStatsDto,
  UpdateHabitDto,
} from './habits.dto.js';
import { HabitsService } from './habits.service.js';

@ApiTags('habits')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('habits')
export class HabitsController {
  constructor(@Inject(HabitsService) private readonly habits: HabitsService) {}

  @Get()
  @Scopes('habits:read')
  @ApiOperation({ summary: 'List habits (RF-1301)' })
  @ApiOkResponse({ type: HabitPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.habits.list(user, pageLimit(limitRaw), cursor), true);
  }

  @Post()
  @Scopes('habits:write')
  @ApiOperation({ summary: 'Create a habit (RF-1301)' })
  @ApiOkResponse({ type: HabitResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHabitDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.habits.create(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Get(':id/stats')
  @Scopes('habits:read')
  @ApiOperation({ summary: 'Habit streaks, completion and heatmaps (RF-1303)' })
  @ApiOkResponse({ type: HabitStatsDto })
  async stats(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('year') year: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.habits.stats(user, id, year), false);
  }

  @Post(':id/checkins')
  @Scopes('habits:write')
  @ApiOperation({
    summary: 'Record a daily check-in with a counter and an optional note (RF-1302)',
  })
  @ApiOkResponse({ type: CheckInResponseDto })
  async checkIn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CheckInDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.habits.checkIn(user, id, dto, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Get(':id')
  @Scopes('habits:read')
  @ApiOperation({ summary: 'Get a habit (RF-1301)' })
  @ApiOkResponse({ type: HabitResponseDto })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.habits.get(user, id), false);
  }

  @Patch(':id')
  @Scopes('habits:write')
  @ApiOperation({ summary: 'Update a habit (RF-1301)' })
  @ApiOkResponse({ type: HabitResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateHabitDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.habits.update(user, id, dto), false);
  }

  @Delete(':id')
  @Scopes('habits:write')
  @ApiOperation({ summary: 'Move a habit to the trash (RF-1301, RF-1304)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.habits.remove(user, id);
    res.status(204).end();
  }
}

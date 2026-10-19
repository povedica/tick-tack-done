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
import { CurrentUser } from '../../auth/current-user.decorator.js';
import type { AuthUser } from '../../auth/auth-user.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import {
  CountdownPageDto,
  CountdownResponseDto,
  CreateCountdownDto,
  UpdateCountdownDto,
} from './countdowns.dto.js';
import { CountdownsService } from './countdowns.service.js';

@ApiTags('countdowns')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('countdowns')
export class CountdownsController {
  constructor(@Inject(CountdownsService) private readonly countdowns: CountdownsService) {}

  @Get()
  @Scopes('countdowns:read')
  @ApiOperation({ summary: 'List countdowns with timezone-calculated days (RF-2431)' })
  @ApiOkResponse({ type: CountdownPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('archived') archivedRaw: string | undefined,
    @Query('dueWithinDays') dueRaw: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const dueWithinDays = dueRaw === undefined ? undefined : Number(dueRaw);
    if (dueWithinDays !== undefined && (!Number.isInteger(dueWithinDays) || dueWithinDays < 0)) {
      res
        .status(422)
        .json({
          code: 'validation_failed',
          message: 'dueWithinDays must be a non-negative integer',
        });
      return;
    }
    respondJson(
      req,
      res,
      200,
      await this.countdowns.list(user, archivedRaw === 'true', dueWithinDays),
      true,
    );
  }
  @Post()
  @Scopes('countdowns:write')
  @ApiOperation({ summary: 'Create a countdown (RF-2401)' })
  @ApiOkResponse({ type: CountdownResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateCountdownDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.countdowns.create(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }
  @Get(':id')
  @Scopes('countdowns:read')
  @ApiOperation({ summary: 'Get a countdown (RF-2431)' })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.countdowns.get(user, id), false);
  }
  @Patch(':id')
  @Scopes('countdowns:write')
  @ApiOperation({ summary: 'Update a countdown (RF-2402)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCountdownDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.countdowns.update(user, id, dto), false);
  }
  @Delete(':id')
  @Scopes('countdowns:write')
  @ApiOperation({ summary: 'Delete a countdown (RF-2405)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.countdowns.remove(user, id);
    res.status(204).end();
  }
  @Post(':id/archive')
  @Scopes('countdowns:write')
  @ApiOperation({ summary: 'Archive a countdown (RF-2403)' })
  async archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.countdowns.archive(user, id, true), false);
  }
  @Post(':id/unarchive')
  @Scopes('countdowns:write')
  @ApiOperation({ summary: 'Unarchive a countdown (RF-2403)' })
  async unarchive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.countdowns.archive(user, id, false), false);
  }
  @Post(':id/restore')
  @Scopes('countdowns:write')
  @ApiOperation({ summary: 'Restore a deleted countdown (RF-2405)' })
  async restore(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.countdowns.restore(user, id), false);
  }
}

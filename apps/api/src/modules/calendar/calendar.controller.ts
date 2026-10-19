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
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Public, Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import { FeedDto, SubscribeDto, UpdateSubscriptionDto } from './calendar.dto.js';
import { CalendarService } from './calendar.service.js';

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}

  @Get('events')
  @Scopes('calendar:read')
  @ApiOperation({ summary: 'Tasks with a date plus external events (RF-1101, RF-2520)' })
  async events(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.range(user, from, to), false);
  }

  @Get('google/calendars')
  @Scopes('calendar:read')
  @ApiOperation({ summary: 'List Google calendars the account can subscribe to (RF-2501)' })
  async googleCalendars(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.listGoogleCalendars(user), false);
  }

  @Get('subscriptions')
  @Scopes('calendar:read')
  @ApiOperation({ summary: 'List calendar subscriptions (RF-1103, RF-2505)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.listSubscriptions(user), false);
  }

  @Post('subscriptions')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Subscribe to an iCal URL or a Google calendar (RF-1103, RF-2502)' })
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribeDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (dto.provider === 'google' && dto.sync_direction !== 'two_way') {
      const result = await this.calendar.subscribeGoogle(user, dto, key);
      respondJson(req, res, result.statusCode, result.body, false);
      return;
    }
    respondJson(req, res, 201, await this.calendar.subscribe(user, dto), false);
  }

  @Patch('subscriptions/:id')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Rename, recolor or hide a calendar subscription (RF-2503)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateSubscriptionDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.calendar.updateSubscription(user, id, dto, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Post('sync')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Sync every external calendar subscription (RF-2521)' })
  async syncAll(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.syncAll(user), false);
  }

  @Post('subscriptions/:id/refresh')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Sync one subscription now (RF-1103, RF-2514)' })
  async refresh(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.refresh(user, id), false);
  }

  @Post('subscriptions/:id/push')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Google Calendar two-way write (V2). Stops without credentials.' })
  async push(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.push(user, id), false);
  }

  @Delete('subscriptions/:id')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Remove a calendar subscription' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.calendar.removeSubscription(user, id);
    res.status(204).end();
  }

  @Get('feeds')
  @Scopes('calendar:read')
  @ApiOperation({ summary: 'List active iCal feeds. The secret URL is not returned (RF-1104)' })
  async listFeeds(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.listFeeds(user), false);
  }

  @Post('feeds')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Create a secret iCal feed for a list or filter (RF-1104)' })
  @ApiOkResponse({ description: 'The secret URL is returned once' })
  async createFeed(
    @CurrentUser() user: AuthUser,
    @Body() dto: FeedDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.calendar.createFeed(user, dto), false);
  }

  @Post('feeds/:id/rotate')
  @Scopes('calendar:write')
  @ApiOperation({
    summary: 'Regenerate an iCal feed URL. The previous URL stops working (RF-1104)',
  })
  async rotateFeed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.rotateFeed(user, id), false);
  }

  @Delete('feeds/:id')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Revoke an iCal feed (RF-1104)' })
  async revokeFeed(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.calendar.revokeFeed(user, id);
    res.status(204).end();
  }
}

/** Public secret URL. Not under /api/v1. */
@Controller('feeds')
export class FeedsController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Read-only iCal feed (RF-1104)' })
  async feed(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const body = await this.calendar.feedIcal(token.replace(/\.ics$/, ''));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.status(200).send(body);
  }
}

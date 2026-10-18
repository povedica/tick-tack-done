import { Body, Controller, Delete, Get, Inject, Param, ParseUUIDPipe, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { respondJson } from '../../http/respond';
import { CalendarService } from './calendar.service';

export class SubscribeDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  url?: string;

  @ApiProperty({ required: false, enum: ['ical', 'google'] })
  @IsOptional()
  @IsIn(['ical', 'google'])
  provider?: 'ical' | 'google';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  color?: string;

  @ApiProperty({ required: false, enum: ['read', 'two_way'] })
  @IsOptional()
  @IsIn(['read', 'two_way'])
  sync_direction?: 'read' | 'two_way';
}

export class FeedDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  project_id?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  filter_id?: string;
}

@ApiTags('calendar')
@Controller('calendar')
export class CalendarController {
  constructor(@Inject(CalendarService) private readonly calendar: CalendarService) {}

  @Get('events')
  @Scopes('calendar:read')
  @ApiOperation({ summary: 'Tasks with a date plus external events (RF-1101, RF-1102)' })
  async events(
    @CurrentUser() user: AuthUser,
    @Query('from') from: string,
    @Query('to') to: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.range(user, from, to), false);
  }

  @Get('subscriptions')
  @Scopes('calendar:read')
  @ApiOperation({ summary: 'List calendar subscriptions (RF-1103)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.calendar.listSubscriptions(user), false);
  }

  @Post('subscriptions')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Subscribe to an iCal URL or Google Calendar read (RF-1103, RF-2004)' })
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body() dto: SubscribeDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.calendar.subscribe(user, dto), false);
  }

  @Post('subscriptions/:id/refresh')
  @Scopes('calendar:write')
  @ApiOperation({ summary: 'Fetch an iCal subscription (RF-1103)' })
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
  @ApiOperation({ summary: 'Read-only iCal feed (RF-1104)' })
  async feed(@Param('token') token: string, @Res() res: Response): Promise<void> {
    const body = await this.calendar.feedIcal(token.replace(/\.ics$/, ''));
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.status(200).send(body);
  }
}

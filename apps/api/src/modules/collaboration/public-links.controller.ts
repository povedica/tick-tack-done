import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsISO8601, IsOptional } from 'class-validator';
import type { Request, Response } from 'express';
import { Public } from '../../auth/scopes.decorator.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import type { AuthUser } from '../../auth/auth-user.js';
import { respondJson } from '../../http/respond.js';
import { PublicLinksService, type PublicLinkInput } from './public-links.service.js';

class PublicLinkDto {
  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsISO8601()
  expires_at?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  include_notes?: boolean;
}

@Controller()
export class PublicLinksController {
  constructor(@Inject(PublicLinksService) private readonly links: PublicLinksService) {}

  @Get('projects/:id/public-link')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Public link status for a list you own (COMP-29)' })
  async state(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.links.state(user, id), false);
  }

  @Post('projects/:id/public-link')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Create a read-only public link (COMP-29)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublicLinkDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.links.create(user, id, dto), false);
  }

  @Post('projects/:id/public-link/regenerate')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Replace the public link (COMP-29)' })
  async regenerate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.links.regenerate(user, id), false);
  }

  @Patch('projects/:id/public-link')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Change public link expiry or notes (COMP-29)' })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: PublicLinkDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.links.update(user, id, dto), false);
  }

  @Delete('projects/:id/public-link')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Revoke the public link (COMP-29)' })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.links.revoke(user, id);
    res.status(204).end();
  }
}

@Controller('public/lists')
export class PublicListsController {
  constructor(@Inject(PublicLinksService) private readonly links: PublicLinksService) {}

  @Get(':token')
  @Public()
  @ApiOperation({ summary: 'Read a shared list without signing in (COMP-29)' })
  async read(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    const ip = req.ip ?? 'unknown';
    respondJson(req, res, 200, await this.links.readPublic(token, ip), false);
  }
}

export type { PublicLinkInput };

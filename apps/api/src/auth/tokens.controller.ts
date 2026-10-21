import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiQuery,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { respondJson } from '../http/respond.js';
import type { AuthUser } from './auth-user.js';
import { CurrentUser } from './current-user.decorator.js';
import { ACCOUNT_ADMIN_SCOPE } from './scopes.js';
import { Scopes } from './scopes.decorator.js';
import { ActivityPageDto, CreateTokenDto, TokenCreatedDto, TokenPageDto } from './tokens.dto.js';
import { TokensService } from './tokens.service.js';

@ApiTags('me')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('me')
export class TokensController {
  constructor(@Inject(TokensService) private readonly tokens: TokensService) {}

  @Get('tokens')
  @ApiQuery({
    name: 'status',
    required: false,
    enum: ['active', 'revoked'],
    description:
      'Active means not revoked (including expired access tokens). Revoked excludes automatic OAuth rotations.',
  })
  @Scopes('profile:read')
  @ApiOperation({ summary: 'List personal access tokens. The secret is never returned (RF-2002).' })
  @ApiOkResponse({ type: TokenPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tokens.list(user, limit, cursor, status), true);
  }

  @Post('tokens')
  @Scopes(ACCOUNT_ADMIN_SCOPE)
  @ApiOperation({
    summary: 'Create one token for an agent. The secret is shown once (RF-2002).',
  })
  @ApiCreatedResponse({ type: TokenCreatedDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTokenDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.tokens.create(user, dto.name, dto.scopes), false);
  }

  @Get('tokens/:id/activity')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Activity performed with one token (RF-2002)' })
  @ApiOkResponse({ type: ActivityPageDto })
  async tokenActivity(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tokens.activity(user, id, limit, cursor), true);
  }

  @Delete('tokens/:id')
  @Scopes(ACCOUNT_ADMIN_SCOPE)
  @ApiOperation({ summary: 'Revoke a personal access token immediately (RF-2002)' })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tokens.revoke(user, id);
    res.status(204).end();
  }

  @Get('activity')
  @Scopes('profile:read')
  @ApiOperation({ summary: 'Account activity log' })
  @ApiOkResponse({ type: ActivityPageDto })
  async activity(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tokens.accountActivity(user, limit, cursor), true);
  }
}

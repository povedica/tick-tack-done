import {
  Body,
  Controller,
  Delete,
  Inject,
  Get,
  Headers,
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
  CreateTagDto,
  MergeTagsDto,
  TagPageDto,
  TagResponseDto,
  UpdateTagDto,
} from './tags.dto.js';
import { TagsService } from './tags.service.js';

@ApiTags('tags')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('tags')
export class TagsController {
  constructor(@Inject(TagsService) private readonly tags: TagsService) {}

  @Get()
  @Scopes('tags:read')
  @ApiOperation({ summary: 'List tags with active task counts (RF-403)' })
  @ApiOkResponse({ type: TagPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tags.list(user, pageLimit(limitRaw), cursor), true);
  }

  @Post()
  @Scopes('tags:write')
  @ApiOperation({ summary: 'Create a tag' })
  @ApiOkResponse({ type: TagResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTagDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tags.create(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Post('merge')
  @Scopes('tags:write')
  @ApiOperation({ summary: 'Merge one tag into another' })
  @ApiOkResponse({ type: TagResponseDto })
  async merge(
    @CurrentUser() user: AuthUser,
    @Body() dto: MergeTagsDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tags.merge(user, dto, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Get(':id')
  @Scopes('tags:read')
  @ApiOperation({ summary: 'Get a tag' })
  @ApiOkResponse({ type: TagResponseDto })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tags.get(user, id), false);
  }

  @Patch(':id')
  @Scopes('tags:write')
  @ApiOperation({ summary: 'Rename, recolor, reparent or reorder a tag' })
  @ApiOkResponse({ type: TagResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tags.update(user, id, dto), false);
  }

  @Delete(':id')
  @Scopes('tags:write')
  @ApiOperation({ summary: 'Delete a tag. Filters keep working because they store ids (RF-403).' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tags.remove(user, id);
    res.status(204).end();
  }
}

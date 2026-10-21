import { Body, Controller, Get, Inject, Param, Patch, Query, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { pageLimit } from '../../http/cursor.js';
import { respondJson } from '../../http/respond.js';
import { SmartListPageDto, UpdateSmartListsDto, ViewPageDto } from './filters.dto.js';
import { SmartListsService } from './smart-lists.service.js';

@ApiTags('smart-lists')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('smart-lists')
export class SmartListsController {
  constructor(@Inject(SmartListsService) private readonly smartLists: SmartListsService) {}

  @Get()
  @Scopes('filters:read')
  @ApiOperation({ summary: 'System smart lists for the current user (RF-901)' })
  @ApiOkResponse({ type: SmartListPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.smartLists.list(user), true);
  }

  @Patch()
  @Scopes('filters:write')
  @ApiOperation({
    summary: 'Enable and reorder system smart lists (RF-901)',
    description:
      'Core navigation lists always remain enabled: today, tomorrow, next_7_days, all, inbox, no_date, recently_added and someday. Their order remains customizable; visibility preferences apply to the other lists.',
  })
  @ApiOkResponse({ type: SmartListPageDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateSmartListsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.smartLists.update(user, dto), false);
  }

  @Get(':key/tasks')
  @Scopes('filters:read')
  @ApiOperation({ summary: 'List view of a system smart list (RF-901, RF-1001)' })
  @ApiOkResponse({ type: ViewPageDto })
  async tasks(
    @CurrentUser() user: AuthUser,
    @Param('key') key: string,
    @Query('group_by') groupBy: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.smartLists.tasks(user, key, groupBy, sort, pageLimit(limitRaw), cursor),
      true,
    );
  }
}

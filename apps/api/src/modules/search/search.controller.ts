import { Controller, Get, Inject, Query, Req, Res } from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import { pageLimit } from '../../http/cursor.js';
import { SearchResponseDto } from './search.dto.js';
import { SearchService } from './search.service.js';

@ApiTags('search')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly search: SearchService) {}

  @Get()
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Search tasks, notes, lists and tags (RF-1501)' })
  @ApiOkResponse({ type: SearchResponseDto })
  async query(
    @CurrentUser() user: AuthUser,
    @Query('q') q: string | undefined,
    @Query('types') types: string | undefined,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.search.search(
        user,
        q,
        types,
        limit === undefined && cursor === undefined
          ? undefined
          : { limit: pageLimit(limit), ...(cursor === undefined ? {} : { cursor }) },
      ),
      false,
    );
  }
}

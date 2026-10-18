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
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { pageLimit } from '../../http/cursor';
import { respondJson } from '../../http/respond';
import {
  CreateFilterDto,
  FilterPageDto,
  FilterResponseDto,
  PreviewFilterDto,
  UpdateFilterDto,
  ViewPageDto,
} from './filters.dto';
import { FiltersService } from './filters.service';

@ApiTags('filters')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('filters')
export class FiltersController {
  constructor(@Inject(FiltersService) private readonly filters: FiltersService) {}

  @Get()
  @Scopes('filters:read')
  @ApiOperation({ summary: 'List saved filters with task counts (RF-903)' })
  @ApiOkResponse({ type: FilterPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.filters.list(user, pageLimit(limitRaw), cursor), true);
  }

  @Post('preview')
  @Scopes('filters:read')
  @ApiOperation({ summary: 'Preview filter rules without saving (RF-902)' })
  @ApiOkResponse({ type: ViewPageDto })
  async preview(
    @CurrentUser() user: AuthUser,
    @Body() dto: PreviewFilterDto,
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
      await this.filters.preview(user, dto, groupBy, sort, pageLimit(limitRaw), cursor),
      false,
    );
  }

  @Post()
  @Scopes('filters:write')
  @ApiOperation({ summary: 'Save a normal or advanced filter (RF-902)' })
  @ApiOkResponse({ type: FilterResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFilterDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.filters.create(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Get(':id/tasks')
  @Scopes('filters:read')
  @ApiOperation({ summary: 'List view of a saved filter (RF-903, RF-1001)' })
  @ApiOkResponse({ type: ViewPageDto })
  async tasks(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
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
      await this.filters.tasks(user, id, groupBy, sort, pageLimit(limitRaw), cursor),
      true,
    );
  }

  @Get(':id')
  @Scopes('filters:read')
  @ApiOperation({ summary: 'Get a saved filter (RF-902)' })
  @ApiOkResponse({ type: FilterResponseDto })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.filters.get(user, id), false);
  }

  @Patch(':id')
  @Scopes('filters:write')
  @ApiOperation({ summary: 'Update, pin or reorder a filter (RF-902, RF-903)' })
  @ApiOkResponse({ type: FilterResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFilterDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.filters.update(user, id, dto), false);
  }

  @Delete(':id')
  @Scopes('filters:write')
  @ApiOperation({ summary: 'Move a filter to the trash (RF-902)' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.filters.remove(user, id);
    res.status(204).end();
  }
}

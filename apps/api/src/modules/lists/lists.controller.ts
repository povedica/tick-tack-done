import {
  Body,
  Controller,
  Delete,
  Inject,
  Get,
  Headers,
  HttpCode,
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
  ColumnPageDto,
  ColumnResponseDto,
  CreateColumnDto,
  CreateFolderDto,
  CreateProjectDto,
  FolderPageDto,
  FolderResponseDto,
  ProjectPageDto,
  ProjectResponseDto,
  UpdateColumnDto,
  UpdateFolderDto,
  UpdateProjectDto,
} from './lists.dto.js';
import { ListsService } from './lists.service.js';

@ApiTags('lists')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller()
export class ListsController {
  constructor(@Inject(ListsService) private readonly lists: ListsService) {}

  @Get('folders')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'List folders' })
  @ApiOkResponse({ type: FolderPageDto })
  async listFolders(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.lists.listFolders(user, pageLimit(limitRaw), cursor);
    respondJson(req, res, 200, page, true);
  }

  @Post('folders')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Create a folder' })
  @ApiOkResponse({ type: FolderResponseDto })
  async createFolder(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateFolderDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.createFolder(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Get('folders/:id')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Get a folder' })
  @ApiOkResponse({ type: FolderResponseDto })
  async getFolder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.getFolder(user, id), false);
  }

  @Patch('folders/:id')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Update a folder' })
  @ApiOkResponse({ type: FolderResponseDto })
  async updateFolder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFolderDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.updateFolder(user, id, dto), false);
  }

  @Delete('folders/:id')
  @Scopes('lists:write')
  @HttpCode(204)
  @ApiOperation({ summary: 'Move a folder to the trash and detach its lists' })
  async deleteFolder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.lists.deleteFolder(user, id);
    res.status(204).end();
  }

  @Get('projects')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'List projects, with the active task count (RF-305)' })
  @ApiOkResponse({ type: ProjectPageDto })
  async listProjects(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('include_closed') includeClosed: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.lists.listProjects(
      user,
      pageLimit(limitRaw),
      cursor,
      includeClosed === 'true',
    );
    respondJson(req, res, 200, page, true);
  }

  @Post('projects')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Create a list' })
  @ApiOkResponse({ type: ProjectResponseDto })
  async createProject(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateProjectDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.createProject(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Get('projects/:id')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Get a list' })
  @ApiOkResponse({ type: ProjectResponseDto })
  async getProject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.getProject(user, id), false);
  }

  @Get('projects/:id/data')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'List plus its sections and active tasks' })
  async projectData(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.projectData(user, id), true);
  }

  @Patch('projects/:id')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Update a list' })
  @ApiOkResponse({ type: ProjectResponseDto })
  async updateProject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateProjectDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.updateProject(user, id, dto), false);
  }

  @Delete('projects/:id')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Move a list and its tasks to the trash' })
  async deleteProject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.lists.deleteProject(user, id);
    res.status(204).end();
  }

  @Post('projects/:id/archive')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Archive a list' })
  @ApiOkResponse({ type: ProjectResponseDto })
  async archive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.archive(user, id, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Post('projects/:id/unarchive')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Unarchive a list' })
  @ApiOkResponse({ type: ProjectResponseDto })
  async unarchive(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.unarchive(user, id, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Post('projects/:id/archive-completed')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Archive every completed task in a list (RF-306)' })
  async archiveCompleted(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.archiveCompleted(user, id, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Get('projects/:id/columns')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'List sections of a list' })
  @ApiOkResponse({ type: ColumnPageDto })
  async listColumns(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const items = await this.lists.listColumns(user, id);
    respondJson(req, res, 200, { items, next_cursor: null }, true);
  }

  @Post('projects/:id/columns')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Create a section' })
  @ApiOkResponse({ type: ColumnResponseDto })
  async createColumn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateColumnDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.createColumn(user, id, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Patch('projects/:id/columns/:columnId')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Rename, collapse or reorder a section (RF-304)' })
  @ApiOkResponse({ type: ColumnResponseDto })
  async updateColumn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Body() dto: UpdateColumnDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.updateColumn(user, id, columnId, dto), false);
  }

  @Delete('projects/:id/columns/:columnId')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Delete a section and detach its tasks' })
  async deleteColumn(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('columnId', ParseUUIDPipe) columnId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.lists.deleteColumn(user, id, columnId);
    res.status(204).end();
  }
}

import {
  Body,
  Controller,
  Delete,
  Inject,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { pageLimit } from '../../http/cursor.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { optionalUuid } from '../../http/uuid-query.js';
import {
  ColumnPageDto,
  ColumnResponseDto,
  CreateColumnDto,
  CreateFolderDto,
  CreateProjectDto,
  DeletionImpactDto,
  FolderPageDto,
  FolderResponseDto,
  ProjectPageDto,
  ProjectResponseDto,
  SetProjectStateDto,
  UpdateColumnDto,
  UpdateFolderDto,
  UpdateProjectDto,
} from './lists.dto.js';
import { ListsService, type ProjectListFilters } from './lists.service.js';
import {
  ProjectOverviewDto,
  ProjectReviewResultDto,
  ReviewProjectsDto,
} from './projects-overview.dto.js';
import { ProjectsOverviewService } from './projects-overview.service.js';
import type { ProjectStateName } from './lists.mapper.js';

@ApiTags('lists')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller()
export class ListsController {
  constructor(
    @Inject(ListsService) private readonly lists: ListsService,
    @Inject(ProjectsOverviewService) private readonly overview: ProjectsOverviewService,
  ) {}

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
  @ApiQuery({ name: 'folder_id', required: false, description: 'Folder UUID, or none.' })
  @ApiQuery({ name: 'is_project', required: false, enum: ['true', 'false'] })
  @ApiQuery({ name: 'state', required: false, enum: ['active', 'paused', 'archived'] })
  @ApiQuery({ name: 'include_closed', required: false, enum: ['true', 'false'] })
  @ApiOkResponse({ type: ProjectPageDto })
  async listProjects(
    @CurrentUser() user: AuthUser,
    @Query('limit') limitRaw: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('include_closed') includeClosed: string | undefined,
    @Query('folder_id') folderId: string | undefined,
    @Query('is_project') isProject: string | undefined,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const filters = projectListFilters(folderId, isProject, state);
    const page = await this.lists.listProjects(
      user,
      pageLimit(limitRaw),
      cursor,
      includeClosed === 'true' || filters.state === 'archived',
      filters,
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

  // Literal paths must be registered before projects/:id. ParseUUIDPipe would reject them with 400.
  @Get('projects/overview')
  @Scopes('lists:read', 'tasks:read')
  @ApiOperation({
    summary: 'Projects kanban: next action, progress and state for every project list',
  })
  @ApiQuery({ name: 'state', required: false, enum: ['active', 'paused', 'archived'] })
  @ApiOkResponse({ type: ProjectOverviewDto })
  async projectOverview(
    @CurrentUser() user: AuthUser,
    @Query('state') state: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.overview.overview(user, overviewState(state)), false);
  }

  @Post('projects/review')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Mark up to 50 projects as reviewed' })
  @ApiOkResponse({ type: ProjectReviewResultDto })
  async reviewProjects(
    @CurrentUser() user: AuthUser,
    @Body() dto: ReviewProjectsDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.overview.markReviewed(user, dto.ids), false);
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

  @Get('projects/:id/deletion-impact')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Count tasks that deleting the list would move to the trash' })
  @ApiOkResponse({ type: DeletionImpactDto })
  async deletionImpact(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.lists.deletionImpact(user, id), false);
  }

  @Post('projects/:id/state')
  @Scopes('lists:write')
  @ApiOperation({
    summary: 'Move a project between active, paused and archived in one call',
  })
  @ApiOkResponse({ type: ProjectResponseDto })
  async setProjectState(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetProjectStateDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.lists.setProjectState(user, id, dto.state, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Post('projects/:id/review')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Mark one project as reviewed' })
  @ApiOkResponse({ type: ProjectReviewResultDto })
  async reviewProject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.overview.markReviewed(user, [id]), false);
  }

  @Delete('projects/:id')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Move a list and its tasks to the trash' })
  @ApiQuery({
    name: 'expected_task_count',
    required: false,
    description: 'When set, delete only if it matches the current task count.',
  })
  async deleteProject(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('expected_task_count') expectedRaw: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    await this.lists.deleteProject(user, id, expectedTaskCount(expectedRaw));
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

function overviewState(state: string | undefined): ProjectStateName | undefined {
  if (state === undefined || state.length === 0) {
    return undefined;
  }
  if (state !== 'active' && state !== 'paused' && state !== 'archived') {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'state must be active, paused or archived',
    );
  }
  return state;
}

function projectListFilters(
  folderId: string | undefined,
  isProject: string | undefined,
  state: string | undefined,
): ProjectListFilters {
  const folder =
    folderId === undefined || folderId.length === 0
      ? undefined
      : folderId === 'none'
        ? null
        : optionalUuid(folderId, 'folder_id');
  let parsedProject: boolean | undefined;
  if (isProject !== undefined && isProject.length > 0) {
    if (isProject !== 'true' && isProject !== 'false') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'is_project must be true or false',
      );
    }
    parsedProject = isProject === 'true';
  }
  let parsedState: ProjectListFilters['state'];
  if (state !== undefined && state.length > 0) {
    if (state !== 'active' && state !== 'paused' && state !== 'archived') {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'state must be active, paused or archived',
      );
    }
    parsedState = state;
  }
  return {
    ...(folder === undefined ? {} : { folderId: folder }),
    ...(parsedProject === undefined ? {} : { isProject: parsedProject }),
    ...(parsedState === undefined ? {} : { state: parsedState }),
  };
}

function expectedTaskCount(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.length === 0) {
    return undefined;
  }
  if (!/^\d+$/.test(raw)) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'expected_task_count must be an integer >= 0',
    );
  }
  return Number(raw);
}

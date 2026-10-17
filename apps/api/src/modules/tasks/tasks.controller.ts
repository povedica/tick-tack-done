import { createReadStream } from 'node:fs';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiHeader,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { memoryStorage } from 'multer';
import { isPriority, type Priority } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { pageLimit } from '../../http/cursor';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { ATTACHMENT_MAX_BYTES } from './attachment-storage';
import { parseTaskSort, type TaskSort } from './task-cursor';
import type { TaskListQuery } from './tasks.service';
import { TasksService } from './tasks.service';
import {
  BatchTasksDto,
  ChecklistItemDto,
  CompleteTaskDto,
  CreateTaskDto,
  MoveTaskDto,
  TaskPageDto,
  TaskResponseDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from './tasks.dto';

@ApiTags('tasks')
@ApiHeader({ name: 'X-Dev-User-Email', required: false })
@Controller('tasks')
export class TasksController {
  constructor(@Inject(TasksService) private readonly tasks: TasksService) {}

  @Get('completed')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Completed tasks' })
  @ApiOkResponse({ type: TaskPageDto })
  async completed(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.tasks.list(user, this.query(limit, cursor, { status: 'completed', flat: true })),
      true,
    );
  }

  @Get('trash')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Trashed tasks' })
  @ApiOkResponse({ type: TaskPageDto })
  async trash(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.tasks.list(
        user,
        this.query(limit, cursor, { status: 'all', flat: true, deleted: true }),
      ),
      true,
    );
  }

  @Delete('trash')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Empty the trash (RF-306)' })
  async emptyTrash(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.emptyTrash(user), false);
  }

  @Post('trash/:id/restore')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Restore a trashed task' })
  @ApiOkResponse({ type: TaskResponseDto })
  async restore(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.restore(user, id), false);
  }

  @Post('batch')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Bulk complete, move, tag, prioritize, reschedule or delete (RF-208)' })
  async batch(
    @CurrentUser() user: AuthUser,
    @Body() dto: BatchTasksDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.batch(user, dto), false);
  }

  @Get()
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'List tasks. Subtasks stay nested unless flat=true (RF-205).' })
  @ApiOkResponse({ type: TaskPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('project_id') projectId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('priority') priority: string | undefined,
    @Query('tag') tag: string | undefined,
    @Query('include_descendants') includeDescendants: string | undefined,
    @Query('due_before') dueBefore: string | undefined,
    @Query('due_after') dueAfter: string | undefined,
    @Query('q') q: string | undefined,
    @Query('flat') flat: string | undefined,
    @Query('sort') sort: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const page = await this.tasks.list(
      user,
      this.query(limit, cursor, {
        ...(projectId === undefined ? {} : { projectId }),
        status: this.status(status),
        ...(priority === undefined ? {} : { priority: this.priority(priority) }),
        ...(tag === undefined ? {} : { tagId: tag }),
        includeDescendants: includeDescendants !== 'false',
        ...(dueBefore === undefined ? {} : { dueBefore }),
        ...(dueAfter === undefined ? {} : { dueAfter }),
        ...(q === undefined ? {} : { q }),
        flat: flat === 'true',
        sort: parseTaskSort(sort),
      }),
    );
    respondJson(req, res, 200, page, true);
  }

  @Post()
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Create a task. Checklist lines can be extracted from Markdown (RF-202).',
  })
  @ApiOkResponse({ type: TaskResponseDto })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateTaskDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tasks.create(user, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Get(':id')
  @Scopes('tasks:read')
  @ApiOperation({
    summary: 'Task detail, checklist progress, subtasks and activity (RF-207, RF-209)',
  })
  @ApiOkResponse({ type: TaskResponseDto })
  async get(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.get(user, id), false);
  }

  @Patch(':id')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Update a task, including kind task/note and priority (RF-204, RF-501)',
  })
  @ApiOkResponse({ type: TaskResponseDto })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTaskDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.update(user, id, dto), false);
  }

  @Delete(':id')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Move a task and its subtasks to the trash' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tasks.remove(user, id);
    res.status(204).end();
  }

  @Post(':id/complete')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Complete a task. Active children require a choice unless a policy is set (RF-206).',
  })
  @ApiOkResponse({ type: TaskResponseDto })
  async complete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CompleteTaskDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tasks.complete(user, id, dto, key);
    respondJson(req, res, result.statusCode, result.body, false);
  }

  @Post(':id/uncomplete')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Mark a task active again' })
  @ApiOkResponse({ type: TaskResponseDto })
  async uncomplete(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.uncomplete(user, id), false);
  }

  @Post(':id/move')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Move a task between lists or sections (RF-204)' })
  @ApiOkResponse({ type: TaskResponseDto })
  async move(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveTaskDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.move(user, id, dto), false);
  }

  @Post(':id/duplicate')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Duplicate a task with its checklist and subtasks (RF-204)' })
  @ApiOkResponse({ type: TaskResponseDto })
  async duplicate(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tasks.duplicate(user, id, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Post(':id/items')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Add a checklist item' })
  async createItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChecklistItemDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tasks.createItem(user, id, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Patch(':id/items/:itemId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Update a checklist item' })
  async updateItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Body() dto: UpdateChecklistItemDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.updateItem(user, id, itemId, dto), false);
  }

  @Delete(':id/items/:itemId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Delete a checklist item' })
  async deleteItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tasks.deleteItem(user, id, itemId);
    res.status(204).end();
  }

  @Post(':id/items/:itemId/complete')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Complete a checklist item' })
  async completeItem(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('itemId', ParseUUIDPipe) itemId: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.completeItem(user, id, itemId), false);
  }

  @Post(':id/attachments')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Attach a file to a task (RF-203)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: ATTACHMENT_MAX_BYTES },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.tasks.addAttachment(user, id, file), false);
  }

  @Get(':id/attachments')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'List attachments of a task' })
  async listAttachments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, { items: await this.tasks.listAttachments(user, id) }, false);
  }

  @Get(':id/attachments/:attachmentId')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Download an attachment' })
  async download(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.tasks.openAttachment(user, id, attachmentId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.fileName.replace(/"/g, '')}"`,
    );
    createReadStream(file.absolute).pipe(res);
  }

  @Delete(':id/attachments/:attachmentId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Delete an attachment' })
  async deleteAttachment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tasks.deleteAttachment(user, id, attachmentId);
    res.status(204).end();
  }

  private query(
    limit: string | undefined,
    cursor: string | undefined,
    extra: Partial<TaskListQuery>,
  ): TaskListQuery {
    return {
      limit: pageLimit(limit),
      ...(cursor === undefined ? {} : { cursor }),
      status: 'active',
      includeDescendants: true,
      flat: false,
      sort: 'manual' satisfies TaskSort,
      deleted: false,
      ...extra,
    };
  }

  private status(raw: string | undefined): TaskListQuery['status'] {
    if (raw === undefined || raw === '' || raw === 'active') {
      return 'active';
    }
    if (raw === 'completed' || raw === 'archived' || raw === 'all') {
      return raw;
    }
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'status is invalid');
  }

  private priority(raw: string): Priority {
    if (!isPriority(raw)) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'priority is invalid');
    }
    return raw;
  }
}

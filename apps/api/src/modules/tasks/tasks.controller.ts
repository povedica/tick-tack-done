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
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { pageLimit } from '../../http/cursor.js';
import { DomainException } from '../../http/domain.exception.js';
import { optionalUuid } from '../../http/uuid-query.js';
import { respondJson } from '../../http/respond.js';
import { ATTACHMENT_MAX_BYTES } from './attachment-storage.js';
import { parseTaskSort, type TaskSort } from './task-cursor.js';
import type { TaskListQuery } from './tasks.service.js';
import { TasksService } from './tasks.service.js';
import {
  BatchTasksDto,
  ChecklistItemDto,
  CompleteTaskDto,
  CreateReminderDto,
  CreateTaskDto,
  CreateTaskResponseDto,
  DetachOccurrenceDto,
  MoveTaskDto,
  SnoozeReminderDto,
  SnoozeTaskDto,
  TaskPageDto,
  TaskResponseDto,
  UpdateChecklistItemDto,
  UpdateTaskDto,
} from './tasks.dto.js';

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

  @Delete('trash/:id')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Permanently delete one trashed task' })
  async purge(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tasks.purge(user, id);
    res.status(204).end();
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
  @ApiOperation({
    summary:
      'List tasks. Subtasks stay nested unless flat=true (RF-205). list_id filters one list, same as project_id.',
  })
  @ApiOkResponse({ type: TaskPageDto })
  async list(
    @CurrentUser() user: AuthUser,
    @Query('limit') limit: string | undefined,
    @Query('cursor') cursor: string | undefined,
    @Query('project_id') projectId: string | undefined,
    @Query('list_id') listId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('priority') priority: string | undefined,
    @Query('tag') tag: string | undefined,
    @Query('include_descendants') includeDescendants: string | undefined,
    @Query('due_before') dueBefore: string | undefined,
    @Query('due_after') dueAfter: string | undefined,
    @Query('q') q: string | undefined,
    @Query('flat') flat: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('overdue') overdue: string | undefined,
    @Query('someday') someday: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const project = optionalUuid(
      projectId ?? listId,
      projectId === undefined ? 'list_id' : 'project_id',
    );
    const tagId = optionalUuid(tag, 'tag');
    const page = await this.tasks.list(
      user,
      this.query(limit, cursor, {
        ...(project === undefined ? {} : { projectId: project }),
        status: this.status(status),
        ...(priority === undefined ? {} : { priority: this.priority(priority) }),
        ...(tagId === undefined ? {} : { tagId }),
        includeDescendants: includeDescendants !== 'false',
        ...(dueBefore === undefined ? {} : { dueBefore }),
        ...(dueAfter === undefined ? {} : { dueAfter }),
        ...(q === undefined ? {} : { q }),
        flat: flat === 'true',
        sort: parseTaskSort(sort),
        overdue: overdue === 'true',
        ...(someday === 'true' ? { someday: true } : someday === 'false' ? { someday: false } : {}),
      }),
    );
    respondJson(req, res, 200, page, true);
  }

  @Post()
  @Scopes('tasks:write')
  @ApiOperation({
    summary:
      'Create a task. raw_text is parsed on the server (RF-102); explicit fields override it. Checklist lines can be extracted from Markdown (RF-202).',
  })
  @ApiOkResponse({ type: CreateTaskResponseDto })
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

  @Get(':id/occurrences')
  @Scopes('tasks:read')
  @ApiOperation({
    summary: 'Theoretical occurrences of a repeating task (RF-704). Nothing is stored.',
  })
  async occurrences(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.occurrences(user, id, from, to), false);
  }

  @Post(':id/occurrences/detach')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Detach one occurrence from the series with an EXDATE (RF-705)' })
  @ApiOkResponse({ type: TaskResponseDto })
  async detach(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DetachOccurrenceDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 201, await this.tasks.detach(user, id, dto.due_date, dto.title), false);
  }

  @Post(':id/snooze')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Move the due date to tomorrow, next week or a chosen date (RF-605)' })
  @ApiOkResponse({ type: TaskResponseDto })
  async snooze(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SnoozeTaskDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.tasks.snooze(user, id, dto.preset, dto.date ?? null),
      false,
    );
  }

  @Get(':id/reminders')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Reminders on a task (RF-801)' })
  async listReminders(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.listReminders(user, id), false);
  }

  @Post(':id/reminders')
  @Scopes('reminders:write')
  @ApiOperation({ summary: 'Add a relative, absolute or location reminder (RF-801)' })
  async createReminder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CreateReminderDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const result = await this.tasks.createReminder(user, id, dto, key);
    respondJson(req, res, result.replayed ? result.statusCode : 201, result.body, false);
  }

  @Post(':id/reminders/:reminderId/snooze')
  @Scopes('reminders:write')
  @ApiOperation({
    summary: 'Snooze a reminder for 10 minutes, 1 hour, tomorrow or a custom time (RF-804)',
  })
  async snoozeReminder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Body() dto: SnoozeReminderDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.tasks.snoozeReminder(user, id, reminderId, dto.preset, dto.until ?? null),
      false,
    );
  }

  @Delete(':id/reminders/:reminderId')
  @Scopes('reminders:write')
  @ApiOperation({ summary: 'Delete a reminder' })
  async deleteReminder(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('reminderId', ParseUUIDPipe) reminderId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.tasks.deleteReminder(user, id, reminderId);
    res.status(204).end();
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

  @Post(':id/cancel')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Mark a task as will-not-do. Cancelled tasks stay out of completed and out of trash.',
  })
  @ApiOkResponse({ type: TaskResponseDto })
  async cancel(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.tasks.cancel(user, id), false);
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

  @Get(':id/attachments/:attachmentId/thumbnail')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Download the image thumbnail (RF-203)' })
  async thumbnail(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('attachmentId', ParseUUIDPipe) attachmentId: string,
    @Res() res: Response,
  ): Promise<void> {
    const file = await this.tasks.openThumbnail(user, id, attachmentId);
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader(
      'Content-Disposition',
      `inline; filename="thumb-${file.fileName.replace(/"/g, '')}"`,
    );
    createReadStream(file.absolute).pipe(res);
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
      overdue: false,
      ...extra,
    };
  }

  private status(raw: string | undefined): TaskListQuery['status'] {
    if (raw === undefined || raw === '' || raw === 'active') {
      return 'active';
    }
    if (raw === 'completed' || raw === 'archived' || raw === 'cancelled' || raw === 'all') {
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

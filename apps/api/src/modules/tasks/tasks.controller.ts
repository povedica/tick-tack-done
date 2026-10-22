import { AddTaskLinkDto, TaskLinkPageDto, TaskLinkResponseDto } from './task-links.dto.js';
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
} from '@nestjs/common';
import { ApiHeader, ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { isPriority, type Priority } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { pageLimit } from '../../http/cursor.js';
import { DomainException } from '../../http/domain.exception.js';
import { optionalUuid } from '../../http/uuid-query.js';
import { respondJson } from '../../http/respond.js';
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
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Inclusive bound. YYYY-MM-DD uses the user time zone.',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Exclusive bound. YYYY-MM-DD uses the user time zone.',
  })
  @ApiQuery({
    name: 'range_field',
    required: false,
    enum: ['due', 'start', 'any'],
    description: 'Default any includes intervals overlapping the range.',
  })
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
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Query('range_field') rangeField: string | undefined,
    @Query('q') q: string | undefined,
    @Query('flat') flat: string | undefined,
    @Query('sort') sort: string | undefined,
    @Query('overdue') overdue: string | undefined,
    @Query('someday') someday: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    if (rangeField !== undefined && !['due', 'start', 'any'].includes(rangeField))
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Invalid range_field');
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
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
        rangeField: rangeField === 'due' || rangeField === 'start' ? rangeField : 'any',
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

  @Get(':id/links')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'List task links (auto and manual), available without Google Drive' })
  @ApiOkResponse({ type: TaskLinkPageDto })
  async links(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.tasks.listLinks(user, id);
  }
  @Post(':id/links')
  @Scopes('tasks:write')
  @ApiOperation({
    summary:
      'Add a manual http/https/mailto link. Optional title uses public HTML only, 3s/256KiB/3 redirects maximum.',
  })
  @ApiOkResponse({ type: TaskLinkResponseDto })
  async addLink(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddTaskLinkDto,
  ) {
    return this.tasks.addLink(user, id, dto);
  }
  @Delete(':id/links/:linkId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Remove a link from its owning task' })
  async removeLink(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('linkId', ParseUUIDPipe) linkId: string,
    @Res() res: Response,
  ) {
    await this.tasks.removeLink(user, id, linkId);
    res.status(204).end();
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

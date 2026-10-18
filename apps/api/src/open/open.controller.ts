import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { fromOpenTask, toOpenProject, toOpenTask } from '@reflexionia/domain';
import type { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/current-user.decorator';
import { Scopes } from '../auth/scopes.decorator';
import { DomainException } from '../http/domain.exception';
import { PrismaService } from '../prisma/prisma.service';

/** Section 10.4. TickTick field names on top of the same tables. */
@ApiTags('open')
@Controller('open/v1')
export class OpenController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('project')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'TickTick-shaped project list' })
  async projects(@CurrentUser() user: AuthUser): Promise<unknown[]> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    return rows.map((row) =>
      toOpenProject({
        id: row.id,
        name: row.name,
        color: row.color,
        sortOrder: row.sortOrder.toString(),
        closed: row.closed,
        folderId: row.folderId,
        viewMode: row.viewMode,
        kind: row.kind,
      }),
    );
  }

  @Get('project/:projectId/data')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'TickTick-shaped project data' })
  async data(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
  ): Promise<unknown> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    const tasks = await this.prisma.task.findMany({
      where: { ownerId: user.id, projectId, deletedAt: null },
      include: { checklist: { where: { deletedAt: null } } },
    });
    return {
      project: toOpenProject({
        id: project.id,
        name: project.name,
        color: project.color,
        sortOrder: project.sortOrder.toString(),
        closed: project.closed,
        folderId: project.folderId,
        viewMode: project.viewMode,
        kind: project.kind,
      }),
      tasks: tasks.map((task) =>
        toOpenTask({
          id: task.id,
          projectId: task.projectId,
          title: task.title,
          content: task.content,
          isAllDay: task.isAllDay,
          startDate: task.startDate?.toISOString() ?? null,
          dueDate: task.dueDate?.toISOString() ?? null,
          timeZone: task.timeZone,
          repeatRule: task.repeatRule,
          priority: task.priority,
          status: task.status,
          completedAt: task.completedAt?.toISOString() ?? null,
          sortOrder: task.sortOrder.toString(),
          items: task.checklist.map((item) => ({
            id: item.id,
            title: item.title,
            status: item.status,
            completedAt: item.completedAt?.toISOString() ?? null,
            isAllDay: item.isAllDay,
            sortOrder: item.sortOrder.toString(),
            startDate: item.startDate?.toISOString() ?? null,
            timeZone: item.timeZone,
          })),
        }),
      ),
    };
  }

  @Post('task')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Create a task with TickTick field names' })
  async create(@CurrentUser() user: AuthUser, @Body() body: unknown): Promise<unknown> {
    const write = fromOpenTask(body);
    if (write?.title === undefined || write.title.trim().length === 0) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'title is required');
    }
    const projectId = write.projectId ?? (await this.inbox(user.id));
    const row = await this.prisma.task.create({
      data: {
        ownerId: user.id,
        projectId,
        title: write.title.slice(0, 500),
        content: write.content ?? '',
        priority: write.priority ?? 'none',
        isAllDay: write.isAllDay ?? false,
        startDate: write.startDate == null ? null : new Date(write.startDate),
        dueDate: write.dueDate == null ? null : new Date(write.dueDate),
        timeZone: write.timeZone ?? user.timeZone,
        repeatRule: write.repeatRule ?? null,
        createdById: user.id,
        source: 'api',
      },
    });
    return { id: row.id, projectId: row.projectId, title: row.title };
  }

  @Post('project/:projectId/task/:taskId/complete')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Complete a task with the TickTick path' })
  async complete(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
  ): Promise<unknown> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, projectId, ownerId: user.id, deletedAt: null },
    });
    if (task === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    await this.prisma.task.update({
      where: { id: taskId },
      data: { status: 'completed', completedAt: new Date() },
    });
    return { id: taskId, status: 2 };
  }

  @Delete('project/:projectId/task/:taskId')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Delete a task with the TickTick path' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('projectId') projectId: string,
    @Param('taskId') taskId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.prisma.task.updateMany({
      where: { id: taskId, projectId, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.status(204).end();
  }

  private async inbox(ownerId: string): Promise<string> {
    const inbox = await this.prisma.project.findFirst({
      where: { ownerId, isInbox: true, deletedAt: null },
    });
    if (inbox === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'Inbox was not found');
    }
    return inbox.id;
  }
}

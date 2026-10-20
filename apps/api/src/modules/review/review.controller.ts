import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { proposeDaily, proposeWeekly, type ReviewCandidate } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';

@ApiTags('review')
@Controller('review')
export class ReviewController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('daily')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Propose today’s short list. The UI does not decide (RF-2301)' })
  async daily(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const now = new Date();
    const tasks = await this.candidates(user.id);
    const proposal = proposeDaily(tasks, now.toISOString(), null, {
      now: now.toISOString(),
      timeZone: user.timeZone,
    });
    respondJson(
      req,
      res,
      200,
      { ...proposal, tasks: tasks.filter((task) => proposal.task_ids.includes(task.id)) },
      false,
    );
  }

  @Get('weekly')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Guided weekly review (RF-2302, RF-2303)' })
  async weekly(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const now = new Date();
    const tasks = await this.candidates(user.id);
    const habits = await this.prisma.habit.findMany({
      where: { ownerId: user.id, deletedAt: null, archived: false },
      select: {
        id: true,
        name: true,
        logs: { where: { deletedAt: null }, select: { date: true, count: true } },
      },
    });
    const habitRows = habits.map((habit) => ({
      id: habit.id,
      name: habit.name,
      missedDays: missed(habit.logs, now),
    }));
    const review = proposeWeekly(tasks, habitRows, now.toISOString(), 7);
    const wanted = new Set([...review.overdue_ids, ...review.undated_ids]);
    const names = new Map(tasks.map((task) => [task.listId, task.listName]));
    respondJson(
      req,
      res,
      200,
      {
        ...review,
        tasks: tasks
          .filter((task) => wanted.has(task.id))
          .map((task) => ({
            id: task.id,
            title: task.title,
            dueDate: task.dueDate,
            listId: task.listId,
            listName: task.listName,
            status: task.status,
          })),
        lists: review.stale_list_ids.map((id) => ({ id, name: names.get(id) ?? id })),
        habits: habitRows
          .filter((habit) => review.habits_at_risk.includes(habit.id))
          .map((habit) => ({ id: habit.id, name: habit.name })),
      },
      false,
    );
  }

  private async candidates(ownerId: string): Promise<ReviewCandidate[]> {
    const rows = await this.prisma.task.findMany({
      where: { ownerId, deletedAt: null },
      include: {
        tags: { select: { tag: { select: { name: true } } } },
        project: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      priority: row.priority,
      dueDate: row.dueDate?.toISOString() ?? null,
      listId: row.projectId,
      listName: row.project.name,
      status: row.status,
      updatedAt: row.updatedAt.toISOString(),
      tagNames: row.tags.map((link) => link.tag.name),
      assigneeId: row.assigneeId,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
      isAllDay: row.isAllDay,
      timeZone: row.timeZone,
      isSomeday: row.isSomeday,
    }));
  }
}

function missed(logs: readonly { date: Date; count: number }[], now: Date): number {
  let gap = 0;
  for (let day = 1; day <= 7; day += 1) {
    const key = new Date(now.getTime() - day * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const log = logs.find((item) => item.date.toISOString().slice(0, 10) === key);
    if ((log?.count ?? 0) > 0) {
      break;
    }
    gap += 1;
  }
  return gap;
}

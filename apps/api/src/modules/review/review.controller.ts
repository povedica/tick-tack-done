import { Controller, Get, Inject, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { proposeDaily, proposeWeekly, type ReviewCandidate } from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';

@ApiTags('review')
@Controller('review')
export class ReviewController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Get('daily')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Propose today’s short list. The UI does not decide (RF-2301)' })
  async daily(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): Promise<void> {
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
  async weekly(@CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response): Promise<void> {
    const now = new Date();
    const tasks = await this.candidates(user.id);
    const habits = await this.prisma.habit.findMany({
      where: { ownerId: user.id, deletedAt: null, archived: false },
      select: { id: true, name: true, logs: { where: { deletedAt: null }, select: { date: true, count: true } } },
    });
    const review = proposeWeekly(
      tasks,
      habits.map((habit) => ({
        id: habit.id,
        name: habit.name,
        missedDays: missed(habit.logs, now),
      })),
      now.toISOString(),
      7,
    );
    respondJson(req, res, 200, review, false);
  }

  private async candidates(ownerId: string): Promise<ReviewCandidate[]> {
    const rows = await this.prisma.task.findMany({
      where: { ownerId, deletedAt: null },
      include: { tags: { select: { tag: { select: { name: true } } } }, project: { select: { name: true } } },
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

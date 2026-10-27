import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import {
  nextAction,
  orderBoardItems,
  projectAttention,
  type NextAction,
  type ProjectTask,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { iso } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { projectState, type ProjectStateName } from './lists.mapper.js';
import type {
  InFlightProjectsDto,
  ProjectOverviewDto,
  ProjectOverviewItemDto,
  ProjectReviewResultDto,
  ReviewProjectGroupsDto,
} from './projects-overview.dto.js';

interface BuiltProject {
  readonly item: ProjectOverviewItemDto;
  readonly sort: {
    readonly id: string;
    readonly name: string;
    readonly state: ProjectStateName;
    readonly closedAt: string | null;
    readonly nextAction: { readonly overdue: boolean; readonly actionAt: string | null } | null;
  };
}

@Injectable()
export class ProjectsOverviewService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async overview(user: AuthUser, state?: ProjectStateName): Promise<ProjectOverviewDto> {
    const projects = await this.prisma.project.findMany({
      where: { ownerId: user.id, isProject: true, deletedAt: null },
      select: {
        id: true,
        name: true,
        color: true,
        folderId: true,
        outcome: true,
        closed: true,
        projectStatus: true,
        projectStatusChangedAt: true,
        closedAt: true,
        createdAt: true,
        projectReviewedAt: true,
      },
    });
    const counts = { active: 0, paused: 0, archived: 0 };
    for (const project of projects) {
      counts[projectState(project)] += 1;
    }
    if (projects.length === 0) {
      return { items: [], counts, next_cursor: null };
    }
    const ids = projects.map((project) => project.id);
    const now = new Date();
    const nowIso = now.toISOString();
    const zone = user.timeZone || 'UTC';
    const [statusCounts, activity, candidates] = await Promise.all([
      this.prisma.task.groupBy({
        by: ['projectId', 'status'],
        where: { ownerId: user.id, projectId: { in: ids }, deletedAt: null, parentId: null },
        _count: true,
      }),
      this.prisma.task.groupBy({
        by: ['projectId'],
        where: { ownerId: user.id, projectId: { in: ids } },
        _max: { updatedAt: true },
      }),
      this.prisma.task.findMany({
        where: {
          ownerId: user.id,
          projectId: { in: ids },
          deletedAt: null,
          parentId: null,
          status: 'active',
          isSomeday: false,
        },
        select: {
          id: true,
          projectId: true,
          title: true,
          dueDate: true,
          startDate: true,
          isAllDay: true,
          timeZone: true,
          sortOrder: true,
        },
      }),
    ]);
    const progress = new Map<string, { done: number; total: number; open: number }>();
    for (const row of statusCounts) {
      const current = progress.get(row.projectId) ?? { done: 0, total: 0, open: 0 };
      const raw = row._count as number | { readonly _all: number };
      const count = typeof raw === 'number' ? raw : raw._all;
      if (row.status !== 'cancelled') {
        current.total += count;
      }
      if (row.status === 'completed') {
        current.done += count;
      }
      if (row.status === 'active') {
        current.open += count;
      }
      progress.set(row.projectId, current);
    }
    const lastActivity = new Map(
      activity.map((row) => [row.projectId, row._max.updatedAt?.toISOString() ?? null]),
    );
    const tasksByProject = new Map<string, ProjectTask[]>();
    for (const task of candidates) {
      const list = tasksByProject.get(task.projectId) ?? [];
      list.push({
        id: task.id,
        title: task.title,
        status: 'active',
        parentId: null,
        isSomeday: false,
        startDate: task.startDate?.toISOString() ?? null,
        dueDate: task.dueDate?.toISOString() ?? null,
        isAllDay: task.isAllDay,
        timeZone: task.timeZone,
        sortOrder: Number(task.sortOrder),
      });
      tasksByProject.set(task.projectId, list);
    }
    const built: BuiltProject[] = projects.map((project) => {
      const boardState = projectState(project);
      const action = nextAction(tasksByProject.get(project.id) ?? [], nowIso);
      const countsForProject = progress.get(project.id) ?? { done: 0, total: 0, open: 0 };
      const last = lastActivity.get(project.id) ?? null;
      const item: ProjectOverviewItemDto = {
        id: project.id,
        name: project.name,
        color: project.color,
        folder_id: project.folderId,
        outcome: project.outcome,
        state: boardState,
        project_status_changed_at: iso(project.projectStatusChangedAt),
        closed_at: iso(project.closedAt),
        created_at: project.createdAt.toISOString(),
        project_reviewed_at: iso(project.projectReviewedAt),
        done_count: countsForProject.done,
        total_count: countsForProject.total,
        open_count: countsForProject.open,
        next_action: toNextAction(action),
        last_activity_at: last,
        attention: projectAttention(
          { state: boardState, nextAction: action, lastActivityAt: last },
          nowIso,
          zone,
        ),
      };
      return {
        item,
        sort: {
          id: project.id,
          name: project.name,
          state: boardState,
          closedAt: item.closed_at,
          nextAction:
            action === null ? null : { overdue: action.overdue, actionAt: action.actionAt },
        },
      };
    });
    const byId = new Map(built.map((row) => [row.item.id, row.item]));
    const items = orderBoardItems(built.map((row) => row.sort))
      .map((row) => byId.get(row.id))
      .filter((row): row is ProjectOverviewItemDto => row !== undefined);
    return {
      items: state === undefined ? items : items.filter((item) => item.state === state),
      counts,
      next_cursor: null,
    };
  }

  async inFlight(user: AuthUser): Promise<InFlightProjectsDto> {
    const board = await this.overview(user);
    const active = board.items.filter((item) => item.state === 'active');
    return {
      items: active.slice(0, 4),
      counts: board.counts,
      no_next_action_count: active.filter((item) => item.attention === 'no_next_action').length,
    };
  }

  async reviewGroups(user: AuthUser): Promise<ReviewProjectGroupsDto> {
    const board = await this.overview(user);
    return {
      attention: board.items.filter((item) => item.state === 'active' && item.attention !== null),
      paused: board.items.filter((item) => item.state === 'paused'),
      ok: board.items.filter((item) => item.state === 'active' && item.attention === null),
    };
  }

  async markReviewed(user: AuthUser, ids: readonly string[]): Promise<ProjectReviewResultDto> {
    const unique = [...new Set(ids)];
    if (unique.length < 1 || unique.length > 50) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'ids must contain 1 to 50 projects',
      );
    }
    const reviewed = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.project.findMany({
        where: { ownerId: user.id, id: { in: unique }, isProject: true, deletedAt: null },
        select: { id: true, name: true, projectReviewedAt: true },
      });
      if (rows.length !== unique.length) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
      }
      const now = new Date();
      for (const row of rows) {
        await tx.project.update({ where: { id: row.id }, data: { projectReviewedAt: now } });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.projectUpdated,
          entityType: 'project',
          entityId: row.id,
          action: 'updated',
          data: {
            project: {
              id: row.id,
              name: row.name,
              project_reviewed_at: now.toISOString(),
            },
          },
          previous: { project_reviewed_at: iso(row.projectReviewedAt) },
        });
      }
      return rows.length;
    });
    return { reviewed };
  }
}

function toNextAction(action: NextAction | null): ProjectOverviewItemDto['next_action'] {
  if (action === null) {
    return null;
  }
  return {
    task_id: action.taskId,
    title: action.title,
    due_date: action.dueDate,
    start_date: action.startDate,
    is_all_day: action.isAllDay,
  };
}

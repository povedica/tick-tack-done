import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Column, Folder, Project } from '@prisma/client';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson, iso } from '../../http/json';
import { decodeCursor, slicePage, type Page } from '../../http/cursor';
import { DomainException } from '../../http/domain.exception';
import { IdempotencyService } from '../../idempotency/idempotency.service';
import { normalizeIdempotencyKey, requestFingerprint } from '../../idempotency/fingerprint';
import { placementPlan } from '../../ordering/placement';
import { PrismaService } from '../../prisma/prisma.service';
import type { Tx } from '../../prisma/tx';
import type {
  ColumnResponseDto,
  CreateColumnDto,
  CreateFolderDto,
  CreateProjectDto,
  FolderResponseDto,
  ProjectResponseDto,
  UpdateColumnDto,
  UpdateFolderDto,
  UpdateProjectDto,
} from './lists.dto';
import { toColumnJson, toFolderJson, toProjectJson } from './lists.mapper';

interface Result<T> {
  statusCode: number;
  body: T;
  replayed: boolean;
}

@Injectable()
export class ListsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(IdempotencyService) private readonly idempotency: IdempotencyService,
  ) {}

  async listFolders(
    user: AuthUser,
    limit: number,
    cursorRaw: string | undefined,
  ): Promise<Page<FolderResponseDto>> {
    const cursor = this.cursor(cursorRaw);
    const rows = await this.prisma.folder.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { sortOrder: { gt: cursor.sortOrder } },
                { sortOrder: cursor.sortOrder, id: { gt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    return slicePage(rows.map(toFolderJson), limit);
  }

  createFolder(
    user: AuthUser,
    dto: CreateFolderDto,
    keyRaw: string | undefined,
  ): Promise<Result<FolderResponseDto>> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/folders', dto),
      statusCode: 201,
      execute: async (tx) => {
        const name = this.name(dto.name);
        const rows = await tx.folder.findMany({
          where: { ownerId: user.id, deletedAt: null },
          select: { id: true, sortOrder: true },
        });
        const plan = placementPlan(rows, null, dto.before_id, dto.move_to_end);
        await this.applySort(tx, 'folder', plan.updates);
        const row = await tx.folder.create({
          data: { ownerId: user.id, name, sortOrder: plan.movingSortOrder },
        });
        const body = toFolderJson(row);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.folderCreated,
          entityType: 'folder',
          entityId: row.id,
          action: 'created',
          data: { folder: asJson(body) },
          previous: null,
        });
        return body;
      },
    });
  }

  async getFolder(user: AuthUser, id: string): Promise<FolderResponseDto> {
    return toFolderJson(await this.requireFolder(user.id, id));
  }

  async updateFolder(user: AuthUser, id: string, dto: UpdateFolderDto): Promise<FolderResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireFolder(user.id, id, tx);
      const rows = await tx.folder.findMany({
        where: { ownerId: user.id, deletedAt: null },
        select: { id: true, sortOrder: true },
      });
      const reorder = dto.before_id !== undefined || dto.move_to_end === true;
      const plan = reorder ? placementPlan(rows, id, dto.before_id, dto.move_to_end) : null;
      if (plan !== null) {
        await this.applySort(tx, 'folder', plan.updates);
      }
      const row = await tx.folder.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: this.name(dto.name) } : {}),
          ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
        },
      });
      const body = toFolderJson(row);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.folderUpdated,
        entityType: 'folder',
        entityId: id,
        action: 'updated',
        data: { folder: asJson(body) },
        previous: asJson(toFolderJson(current)),
      });
      return body;
    });
  }

  async deleteFolder(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.requireFolder(user.id, id, tx);
      await tx.project.updateMany({
        where: { ownerId: user.id, folderId: id },
        data: { folderId: null },
      });
      const row = await tx.folder.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.folderDeleted,
        entityType: 'folder',
        entityId: id,
        action: 'deleted',
        data: { folder: asJson(toFolderJson(row)) },
        previous: asJson(toFolderJson(current)),
      });
    });
  }

  async listProjects(
    user: AuthUser,
    limit: number,
    cursorRaw: string | undefined,
    includeClosed: boolean,
  ): Promise<Page<ProjectResponseDto>> {
    const cursor = this.cursor(cursorRaw);
    const rows = await this.prisma.project.findMany({
      where: {
        ownerId: user.id,
        deletedAt: null,
        ...(includeClosed ? {} : { closed: false }),
        ...(cursor === undefined
          ? {}
          : {
              OR: [
                { sortOrder: { gt: cursor.sortOrder } },
                { sortOrder: cursor.sortOrder, id: { gt: cursor.id } },
              ],
            }),
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });
    const counts = await this.activeCounts(
      user.id,
      rows.map((row) => row.id),
    );
    return slicePage(
      rows.map((row) => toProjectJson(row, counts.get(row.id) ?? 0)),
      limit,
    );
  }

  createProject(
    user: AuthUser,
    dto: CreateProjectDto,
    keyRaw: string | undefined,
  ): Promise<Result<ProjectResponseDto>> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', '/api/v1/projects', dto),
      statusCode: 201,
      execute: async (tx) => {
        if (dto.folder_id !== undefined && dto.folder_id !== null) {
          await this.requireFolder(user.id, dto.folder_id, tx);
        }
        const rows = await tx.project.findMany({
          where: { ownerId: user.id, deletedAt: null },
          select: { id: true, sortOrder: true },
        });
        const plan = placementPlan(rows, null, dto.before_id, dto.move_to_end);
        await this.applySort(tx, 'project', plan.updates);
        const row = await tx.project.create({
          data: {
            ownerId: user.id,
            name: this.name(dto.name),
            color: dto.color ?? null,
            folderId: dto.folder_id ?? null,
            viewMode: dto.view_mode ?? 'list',
            kind: dto.kind ?? 'TASK',
            sortOrder: plan.movingSortOrder,
          },
        });
        const body = toProjectJson(row, 0);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.projectCreated,
          entityType: 'project',
          entityId: row.id,
          action: 'created',
          data: { project: asJson(body) },
          previous: null,
        });
        return body;
      },
    });
  }

  async getProject(user: AuthUser, id: string): Promise<ProjectResponseDto> {
    const row = await this.requireProject(user.id, id);
    const counts = await this.activeCounts(user.id, [id]);
    return toProjectJson(row, counts.get(id) ?? 0);
  }

  async updateProject(
    user: AuthUser,
    id: string,
    dto: UpdateProjectDto,
  ): Promise<ProjectResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireProject(user.id, id, tx);
      if (dto.folder_id !== undefined && dto.folder_id !== null) {
        await this.requireFolder(user.id, dto.folder_id, tx);
      }
      const reorder = dto.before_id !== undefined || dto.move_to_end === true;
      const rows = await tx.project.findMany({
        where: { ownerId: user.id, deletedAt: null },
        select: { id: true, sortOrder: true },
      });
      const plan = reorder ? placementPlan(rows, id, dto.before_id, dto.move_to_end) : null;
      if (plan !== null) {
        await this.applySort(tx, 'project', plan.updates);
      }
      const row = await tx.project.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: this.name(dto.name) } : {}),
          ...(dto.color !== undefined ? { color: dto.color } : {}),
          ...(dto.folder_id !== undefined ? { folderId: dto.folder_id } : {}),
          ...(dto.view_mode !== undefined ? { viewMode: dto.view_mode } : {}),
          ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
          ...(dto.default_reminder_trigger !== undefined
            ? { defaultReminderTrigger: dto.default_reminder_trigger }
            : {}),
          ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
        },
      });
      const counts = await this.activeCounts(user.id, [id], tx);
      const body = toProjectJson(row, counts.get(id) ?? 0);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.projectUpdated,
        entityType: 'project',
        entityId: id,
        action: 'updated',
        data: { project: asJson(body) },
        previous: asJson(toProjectJson(current, counts.get(id) ?? 0)),
      });
      return body;
    });
  }

  async deleteProject(user: AuthUser, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.requireProject(user.id, id, tx);
      this.assertInbox(current);
      const now = new Date();
      const tasks = await tx.task.findMany({
        where: { ownerId: user.id, projectId: id, deletedAt: null },
        select: { id: true, title: true, status: true },
      });
      await tx.task.updateMany({
        where: { ownerId: user.id, projectId: id, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.column.updateMany({
        where: { ownerId: user.id, projectId: id, deletedAt: null },
        data: { deletedAt: now },
      });
      const row = await tx.project.update({ where: { id }, data: { deletedAt: now } });
      for (const task of tasks) {
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.taskDeleted,
          entityType: 'task',
          entityId: task.id,
          action: 'deleted',
          data: {
            task: { id: task.id, title: task.title, project_id: id, deleted_at: now.toISOString() },
          },
          previous: { status: task.status },
        });
      }
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.projectDeleted,
        entityType: 'project',
        entityId: id,
        action: 'deleted',
        data: { project: asJson(toProjectJson(row, 0)) },
        previous: asJson(toProjectJson(current, tasks.length)),
      });
    });
  }

  archive(
    user: AuthUser,
    id: string,
    keyRaw: string | undefined,
  ): Promise<Result<ProjectResponseDto>> {
    return this.setClosed(user, id, true, keyRaw);
  }

  unarchive(
    user: AuthUser,
    id: string,
    keyRaw: string | undefined,
  ): Promise<Result<ProjectResponseDto>> {
    return this.setClosed(user, id, false, keyRaw);
  }

  archiveCompleted(
    user: AuthUser,
    id: string,
    keyRaw: string | undefined,
  ): Promise<Result<{ archived: number }>> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/projects/${id}/archive-completed`, {}),
      statusCode: 200,
      execute: async (tx) => {
        await this.requireProject(user.id, id, tx);
        const tasks = await tx.task.findMany({
          where: { ownerId: user.id, projectId: id, status: 'completed', deletedAt: null },
          select: { id: true, title: true },
        });
        if (tasks.length > 0) {
          await tx.task.updateMany({
            where: { id: { in: tasks.map((task) => task.id) } },
            data: { status: 'archived' },
          });
        }
        for (const task of tasks) {
          await this.events.record(tx, actorOf(user), {
            type: DomainEvent.taskUpdated,
            entityType: 'task',
            entityId: task.id,
            action: 'updated',
            data: { task: { id: task.id, title: task.title, status: 'archived' } },
            previous: { status: 'completed' },
          });
        }
        return { archived: tasks.length };
      },
    });
  }

  async projectData(
    user: AuthUser,
    id: string,
  ): Promise<{
    project: ProjectResponseDto;
    columns: ColumnResponseDto[];
    tasks: {
      id: string;
      title: string;
      status: string;
      priority: string;
      column_id: string | null;
      parent_id: string | null;
      sort_order: string;
      tag_ids: string[];
      checklist_progress: { completed: number; total: number };
    }[];
  }> {
    const project = await this.getProject(user, id);
    const columns = await this.prisma.column.findMany({
      where: { ownerId: user.id, projectId: id, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    const tasks = await this.prisma.task.findMany({
      where: { ownerId: user.id, projectId: id, parentId: null, deletedAt: null, status: 'active' },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      include: {
        tags: { select: { tagId: true } },
        checklist: { where: { deletedAt: null }, select: { status: true } },
      },
    });
    return {
      project,
      columns: columns.map(toColumnJson),
      tasks: tasks.map((task) => ({
        id: task.id,
        title: task.title,
        status: task.status,
        priority: task.priority,
        column_id: task.columnId,
        parent_id: task.parentId,
        sort_order: task.sortOrder.toString(),
        tag_ids: task.tags.map((link) => link.tagId),
        checklist_progress: {
          completed: task.checklist.filter((item) => item.status === 'completed').length,
          total: task.checklist.length,
        },
      })),
    };
  }

  async listColumns(user: AuthUser, projectId: string): Promise<ColumnResponseDto[]> {
    await this.requireProject(user.id, projectId);
    const rows = await this.prisma.column.findMany({
      where: { ownerId: user.id, projectId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toColumnJson);
  }

  createColumn(
    user: AuthUser,
    projectId: string,
    dto: CreateColumnDto,
    keyRaw: string | undefined,
  ): Promise<Result<ColumnResponseDto>> {
    const key = normalizeIdempotencyKey(keyRaw);
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', `/api/v1/projects/${projectId}/columns`, dto),
      statusCode: 201,
      execute: async (tx) => {
        await this.requireProject(user.id, projectId, tx);
        const rows = await tx.column.findMany({
          where: { ownerId: user.id, projectId, deletedAt: null },
          select: { id: true, sortOrder: true },
        });
        const plan = placementPlan(rows, null, dto.before_id, dto.move_to_end);
        await this.applySort(tx, 'column', plan.updates);
        const row = await tx.column.create({
          data: {
            ownerId: user.id,
            projectId,
            name: this.name(dto.name),
            collapsed: dto.collapsed ?? false,
            wipLimit: dto.wip_limit ?? null,
            sortOrder: plan.movingSortOrder,
          },
        });
        const body = toColumnJson(row);
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.columnCreated,
          entityType: 'column',
          entityId: row.id,
          action: 'created',
          data: { column: asJson(body) },
          previous: null,
        });
        return body;
      },
    });
  }

  async updateColumn(
    user: AuthUser,
    projectId: string,
    id: string,
    dto: UpdateColumnDto,
  ): Promise<ColumnResponseDto> {
    return this.prisma.$transaction(async (tx) => {
      const current = await this.requireColumn(user.id, projectId, id, tx);
      const reorder = dto.before_id !== undefined || dto.move_to_end === true;
      const rows = await tx.column.findMany({
        where: { ownerId: user.id, projectId, deletedAt: null },
        select: { id: true, sortOrder: true },
      });
      const plan = reorder ? placementPlan(rows, id, dto.before_id, dto.move_to_end) : null;
      if (plan !== null) {
        await this.applySort(tx, 'column', plan.updates);
      }
      const row = await tx.column.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: this.name(dto.name) } : {}),
          ...(dto.collapsed !== undefined ? { collapsed: dto.collapsed } : {}),
          ...(dto.wip_limit !== undefined ? { wipLimit: dto.wip_limit } : {}),
          ...(plan !== null ? { sortOrder: plan.movingSortOrder } : {}),
        },
      });
      const body = toColumnJson(row);
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.columnUpdated,
        entityType: 'column',
        entityId: id,
        action: 'updated',
        data: { column: asJson(body) },
        previous: asJson(toColumnJson(current)),
      });
      return body;
    });
  }

  async deleteColumn(user: AuthUser, projectId: string, id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await this.requireColumn(user.id, projectId, id, tx);
      await tx.task.updateMany({
        where: { ownerId: user.id, columnId: id },
        data: { columnId: null },
      });
      const row = await tx.column.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.columnDeleted,
        entityType: 'column',
        entityId: id,
        action: 'deleted',
        data: { column: asJson({ ...toColumnJson(row), deleted_at: iso(row.deletedAt) }) },
        previous: asJson(toColumnJson(current)),
      });
    });
  }

  private async setClosed(
    user: AuthUser,
    id: string,
    closed: boolean,
    keyRaw: string | undefined,
  ): Promise<Result<ProjectResponseDto>> {
    const key = normalizeIdempotencyKey(keyRaw);
    const path = closed ? `/api/v1/projects/${id}/archive` : `/api/v1/projects/${id}/unarchive`;
    return this.idempotency.run({
      ownerId: user.id,
      key,
      fingerprint: requestFingerprint('POST', path, {}),
      statusCode: 200,
      execute: async (tx) => {
        const current = await this.requireProject(user.id, id, tx);
        if (closed) {
          this.assertInbox(current);
        }
        const row = await tx.project.update({ where: { id }, data: { closed } });
        const counts = await this.activeCounts(user.id, [id], tx);
        const body = toProjectJson(row, counts.get(id) ?? 0);
        await this.events.record(tx, actorOf(user), {
          type: closed ? DomainEvent.projectArchived : DomainEvent.projectUnarchived,
          entityType: 'project',
          entityId: id,
          action: 'updated',
          data: { project: asJson(body) },
          previous: { closed: current.closed },
        });
        return body;
      },
    });
  }

  private async activeCounts(
    ownerId: string,
    projectIds: string[],
    tx: Tx | PrismaService = this.prisma,
  ): Promise<Map<string, number>> {
    if (projectIds.length === 0) {
      return new Map();
    }
    const grouped = await tx.task.groupBy({
      by: ['projectId'],
      where: {
        ownerId,
        projectId: { in: projectIds },
        status: 'active',
        deletedAt: null,
        parentId: null,
      },
      _count: { _all: true },
    });
    return new Map(grouped.map((row) => [row.projectId, row._count._all]));
  }

  private async applySort(
    tx: Tx,
    model: 'folder' | 'project' | 'column',
    updates: readonly { id: string; sortOrder: bigint }[],
  ): Promise<void> {
    for (const update of updates) {
      if (model === 'folder') {
        await tx.folder.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } });
      } else if (model === 'project') {
        await tx.project.update({
          where: { id: update.id },
          data: { sortOrder: update.sortOrder },
        });
      } else {
        await tx.column.update({ where: { id: update.id }, data: { sortOrder: update.sortOrder } });
      }
    }
  }

  private async requireFolder(
    ownerId: string,
    id: string,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<Folder> {
    const row = await tx.folder.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'folder_not_found', 'Folder was not found');
    }
    return row;
  }

  private async requireProject(
    ownerId: string,
    id: string,
    tx: Tx | PrismaService = this.prisma,
  ): Promise<Project> {
    const row = await tx.project.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    return row;
  }

  private async requireColumn(
    ownerId: string,
    projectId: string,
    id: string,
    tx: Tx,
  ): Promise<Column> {
    const row = await tx.column.findFirst({ where: { id, ownerId, projectId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'column_not_found', 'Section was not found');
    }
    return row;
  }

  private assertInbox(project: Project): void {
    if (project.isInbox) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'inbox_permanent',
        'The inbox cannot be deleted or archived',
      );
    }
  }

  private name(value: string): string {
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > 200) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'name is required');
    }
    return trimmed;
  }

  private cursor(raw: string | undefined): { sortOrder: bigint; id: string } | undefined {
    if (raw === undefined || raw.length === 0) {
      return undefined;
    }
    return decodeCursor(raw);
  }
}

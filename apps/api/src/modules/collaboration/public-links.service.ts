import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma, PublicListLink } from '@prisma/client';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { AttemptLimiter } from '../../auth/attempt-limiter.js';
import { hashSecret, secretsMatch } from '../../auth/session-cookie.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import { ListAccessService } from './list-access.js';
import { toPublicList, type PublicListBody, type PublicTaskInput } from './public-list.mapper.js';
import { isPublicListToken, newPublicListToken } from './public-list-token.js';

const TASK_CAP = 1000;
const YEAR_MS = 366 * 24 * 60 * 60 * 1000;

export interface PublicLinkInput {
  readonly expires_at?: string | null;
  readonly include_notes?: boolean;
}

@Injectable()
export class PublicLinksService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(ListAccessService) private readonly access: ListAccessService,
    @Inject(AttemptLimiter) private readonly attempts: AttemptLimiter,
  ) {}

  async state(user: AuthUser, projectId: string) {
    await this.requireOwner(user, projectId);
    const row = await this.prisma.publicListLink.findFirst({
      where: { projectId, revokedAt: null },
      include: { createdBy: { select: { displayName: true } } },
    });
    if (row === null) {
      return { active: false as const };
    }
    return this.describe(row, row.createdBy.displayName);
  }

  async create(user: AuthUser, projectId: string, input: PublicLinkInput) {
    const project = await this.requireOwner(user, projectId);
    this.rejectInbox(project.isInbox);
    const expiresAt = this.expiry(input.expires_at);
    const includeNotes = input.include_notes ?? true;
    const token = newPublicListToken();
    const row = await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.publicListLink.updateMany({
        where: { projectId, revokedAt: null, expiresAt: { lte: now } },
        data: { revokedAt: now },
      });
      const existing = await tx.publicListLink.findFirst({
        where: { projectId, revokedAt: null },
        select: { id: true },
      });
      if (existing !== null) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'public_link_exists',
          'A public link already exists',
        );
      }
      const created = await tx.publicListLink.create({
        data: this.data(user, projectId, token, includeNotes, expiresAt),
      });
      await this.record(
        tx,
        user,
        projectId,
        created.id,
        DomainEvent.projectPublicLinkCreated,
        expiresAt,
      );
      return created;
    });
    return { ...this.issued(token, row), include_notes: includeNotes, expires_at: iso(expiresAt) };
  }

  async regenerate(user: AuthUser, projectId: string) {
    const project = await this.requireOwner(user, projectId);
    this.rejectInbox(project.isInbox);
    const token = newPublicListToken();
    const row = await this.prisma.$transaction(async (tx) => {
      const current = await tx.publicListLink.findFirst({ where: { projectId, revokedAt: null } });
      if (current === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'public_link_not_found',
          'Public link was not found',
        );
      }
      const now = new Date();
      await tx.publicListLink.update({ where: { id: current.id }, data: { revokedAt: now } });
      await this.record(
        tx,
        user,
        projectId,
        current.id,
        DomainEvent.projectPublicLinkRevoked,
        current.expiresAt,
      );
      const created = await tx.publicListLink.create({
        data: this.data(user, projectId, token, current.includeNotes, current.expiresAt),
      });
      await this.record(
        tx,
        user,
        projectId,
        created.id,
        DomainEvent.projectPublicLinkCreated,
        created.expiresAt,
      );
      return created;
    });
    return this.issued(token, row);
  }

  async update(user: AuthUser, projectId: string, input: PublicLinkInput) {
    await this.requireOwner(user, projectId);
    const expiresAt = input.expires_at === undefined ? undefined : this.expiry(input.expires_at);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.publicListLink.findFirst({ where: { projectId, revokedAt: null } });
      if (current === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'public_link_not_found',
          'Public link was not found',
        );
      }
      const saved = await tx.publicListLink.update({
        where: { id: current.id },
        data: {
          ...(expiresAt === undefined ? {} : { expiresAt }),
          ...(input.include_notes === undefined ? {} : { includeNotes: input.include_notes }),
        },
      });
      await this.record(
        tx,
        user,
        projectId,
        saved.id,
        DomainEvent.projectPublicLinkUpdated,
        saved.expiresAt,
      );
      return {
        active: this.isLive(saved),
        url_hint: hint(saved.tokenHint),
        include_notes: saved.includeNotes,
        expires_at: iso(saved.expiresAt),
      };
    });
  }

  async revoke(user: AuthUser, projectId: string): Promise<void> {
    await this.requireOwner(user, projectId);
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.publicListLink.findFirst({ where: { projectId, revokedAt: null } });
      if (current === null) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'public_link_not_found',
          'Public link was not found',
        );
      }
      await tx.publicListLink.update({
        where: { id: current.id },
        data: { revokedAt: new Date() },
      });
      await this.record(
        tx,
        user,
        projectId,
        current.id,
        DomainEvent.projectPublicLinkRevoked,
        current.expiresAt,
      );
    });
  }

  async preview(user: AuthUser, projectId: string, input: PublicLinkInput) {
    const project = await this.requireOwner(user, projectId);
    this.rejectInbox(project.isInbox);
    const taskCount = await this.prisma.task.count({
      where: { projectId, deletedAt: null, status: { in: ['active', 'completed'] } },
    });
    return {
      created: false as const,
      preview: {
        list_name: project.name,
        task_count: taskCount,
        include_notes: input.include_notes ?? true,
        expires_at: input.expires_at ?? null,
      },
      warning: 'Anyone with the link can read titles and notes without signing in.',
      hint: 'Call again with confirm=true.',
    };
  }

  async readPublic(token: string, ip: string): Promise<PublicListBody> {
    await this.attempts.assertNamed(`public-list-ip:${ip}`);
    await this.attempts.consumeNamed(`public-list-ip:${ip}`);
    if (!isPublicListToken(token)) {
      throw missing();
    }
    const hash = hashSecret(token);
    await this.attempts.assertNamed(`public-list-token:${hash}`);
    await this.attempts.consumeNamed(`public-list-token:${hash}`);
    const row = await this.prisma.publicListLink.findUnique({
      where: { tokenHash: hash },
      include: {
        project: { select: { name: true, deletedAt: true, closed: true, ownerId: true } },
        owner: { select: { deletedAt: true } },
      },
    });
    if (
      row === null ||
      !secretsMatch(row.tokenHash, hash) ||
      row.revokedAt !== null ||
      (row.expiresAt !== null && row.expiresAt <= new Date()) ||
      row.project.deletedAt !== null ||
      row.project.closed ||
      row.owner.deletedAt !== null
    ) {
      throw missing();
    }
    const tasks = await this.prisma.task.findMany({
      where: {
        projectId: row.projectId,
        deletedAt: null,
        parentId: null,
        status: { in: ['active', 'completed'] },
      },
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }],
      take: TASK_CAP + 1,
      include: {
        tags: {
          where: { tag: { deletedAt: null } },
          include: { tag: { select: { name: true, color: true } } },
        },
        checklist: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          select: { title: true, status: true },
        },
        children: {
          where: { deletedAt: null, status: { in: ['active', 'completed'] } },
          orderBy: { sortOrder: 'asc' },
          select: { title: true, status: true },
        },
      },
    });
    const truncated = tasks.length > TASK_CAP;
    const page = truncated ? tasks.slice(0, TASK_CAP) : tasks;
    const body = toPublicList(
      row.project.name,
      page.map(toInput),
      row.includeNotes,
      truncated,
      new Date(),
    );
    const stale = new Date(Date.now() - 60_000);
    void this.prisma.publicListLink
      .updateMany({
        where: { id: row.id, OR: [{ lastViewedAt: null }, { lastViewedAt: { lt: stale } }] },
        data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
      })
      .catch(() => undefined);
    return body;
  }

  private async requireOwner(user: AuthUser, projectId: string) {
    const role = await this.access.roleFor(user, projectId);
    if (role === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    if (role !== 'owner') {
      throw new DomainException(HttpStatus.FORBIDDEN, 'forbidden', 'Not allowed on this list');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    return project;
  }

  private rejectInbox(isInbox: boolean): void {
    if (isInbox) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'inbox_not_shareable',
        'The inbox cannot be shared',
      );
    }
  }

  private expiry(value: string | null | undefined): Date | null {
    if (value === undefined || value === null) {
      return null;
    }
    const date = new Date(value);
    if (
      Number.isNaN(date.getTime()) ||
      date.getTime() <= Date.now() ||
      date.getTime() > Date.now() + YEAR_MS
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'expires_at is invalid',
      );
    }
    return date;
  }

  private data(
    user: AuthUser,
    projectId: string,
    token: string,
    includeNotes: boolean,
    expiresAt: Date | null,
  ): Prisma.PublicListLinkCreateInput {
    return {
      owner: { connect: { id: user.id } },
      project: { connect: { id: projectId } },
      createdBy: { connect: { id: user.id } },
      tokenHash: hashSecret(token),
      tokenHint: token.slice(-4),
      includeNotes,
      expiresAt,
    };
  }

  private issued(token: string, row: PublicListLink) {
    const base = (process.env.PUBLIC_URL ?? 'http://127.0.0.1:5173').replace(/\/$/, '');
    return {
      url: `${base}/s/${token}`,
      token,
      active: true as const,
      url_hint: hint(row.tokenHint),
      include_notes: row.includeNotes,
      expires_at: iso(row.expiresAt),
      created_at: row.createdAt.toISOString(),
    };
  }

  private describe(row: PublicListLink, displayName: string) {
    return {
      active: this.isLive(row),
      url_hint: hint(row.tokenHint),
      include_notes: row.includeNotes,
      expires_at: iso(row.expiresAt),
      created_at: row.createdAt.toISOString(),
      created_by: { display_name: displayName },
      view_count: row.viewCount,
      last_viewed_at: iso(row.lastViewedAt),
    };
  }

  private isLive(row: PublicListLink): boolean {
    return row.revokedAt === null && (row.expiresAt === null || row.expiresAt > new Date());
  }

  private async record(
    tx: Tx,
    user: AuthUser,
    projectId: string,
    linkId: string,
    type: string,
    expiresAt: Date | null,
  ): Promise<void> {
    await this.events.record(tx, actorOf(user), {
      type,
      entityType: 'project',
      entityId: projectId,
      action: 'updated',
      data: asJson({ project_id: projectId, link_id: linkId, expires_at: iso(expiresAt) }),
      previous: null,
    });
  }
}

function missing(): DomainException {
  return new DomainException(HttpStatus.NOT_FOUND, 'not_found', 'Not found');
}

function hint(tokenHint: string): string {
  return `…${tokenHint}`;
}

function iso(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

function toInput(task: {
  title: string;
  content: string;
  status: 'active' | 'completed' | 'archived' | 'cancelled';
  priority: 'none' | 'low' | 'medium' | 'high';
  startDate: Date | null;
  dueDate: Date | null;
  isAllDay: boolean;
  completedAt: Date | null;
  tags: readonly { tag: { name: string; color: string | null } }[];
  children: readonly { title: string; status: 'active' | 'completed' | 'archived' | 'cancelled' }[];
  checklist: readonly { title: string; status: 'active' | 'completed' }[];
}): PublicTaskInput {
  const status = task.status === 'completed' ? 'completed' : 'active';
  return {
    title: task.title,
    content: task.content,
    status,
    priority: task.priority,
    startDate: task.startDate,
    dueDate: task.dueDate,
    isAllDay: task.isAllDay,
    completedAt: task.completedAt,
    tags: task.tags.map((row) => ({ name: row.tag.name, color: row.tag.color })),
    subtasks: task.children
      .filter((child) => child.status === 'active' || child.status === 'completed')
      .map((child) => ({
        title: child.title,
        status: child.status === 'completed' ? 'completed' : 'active',
      })),
    checklist: task.checklist.map((item) => ({
      title: item.title,
      done: item.status === 'completed',
    })),
  };
}

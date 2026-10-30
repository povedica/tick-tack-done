import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { Prisma, type Project } from '@prisma/client';
import { parseMentions, type SharePermission } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { AttemptLimiter } from '../../auth/attempt-limiter.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { emailConfigured, sendEmail } from '../../mail/send-email.js';
import { renderShareInvitation } from '../../mail/templates/share-invitation.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import type { Tx } from '../../prisma/tx.js';
import { ListAccessService } from './list-access.js';

const INVITE_DAYS = 14;

export interface ShareInput {
  readonly email?: string;
  readonly token_id?: string;
  readonly permission: SharePermission;
}

export type ShareChange = 'created' | 'updated' | 'unchanged';

export interface ShareResult {
  readonly statusCode: number;
  readonly body: {
    readonly id: string;
    readonly permission: SharePermission;
    readonly changed: ShareChange;
    readonly status: 'pending' | 'accepted';
  };
}

@Injectable()
export class CollaborationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(ListAccessService) private readonly access: ListAccessService,
    @Inject(AttemptLimiter) private readonly attempts: AttemptLimiter,
  ) {}

  async members(user: AuthUser, id: string) {
    const { project } = await this.access.requireShareAction(user, id, 'read');
    const owner = await this.prisma.user.findFirst({
      where: { id: project.ownerId, deletedAt: null },
      select: { displayName: true },
    });
    const rows = await this.prisma.projectMember.findMany({
      where: {
        projectId: id,
        deletedAt: null,
        status: { in: ['pending', 'accepted', 'declined'] },
      },
      include: { member: { select: { email: true, displayName: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return {
      items: [
        {
          id: null,
          user_id: project.ownerId,
          permission: 'owner' as const,
          role: 'owner' as const,
          status: 'accepted' as const,
          email: null,
          token_id: null,
          display_name: owner?.displayName ?? null,
        },
        ...rows.map((row) => ({
          id: row.id,
          user_id: row.memberId,
          permission: row.permission,
          role: row.permission,
          status: row.status,
          email: row.member?.email ?? row.inviteEmail,
          token_id: row.tokenId,
          display_name: row.member?.displayName ?? null,
        })),
      ],
    };
  }

  async share(user: AuthUser, id: string, dto: ShareInput): Promise<ShareResult> {
    const hasEmail = dto.email !== undefined && dto.email.trim().length > 0;
    const hasToken = dto.token_id !== undefined;
    if (hasEmail === hasToken) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'validation_failed',
        'Provide an email or a token_id, not both',
      );
    }
    const project = await this.owner(user, id);
    if (project.isInbox) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'inbox_not_shareable',
        'The inbox cannot be shared',
      );
    }
    if (dto.token_id !== undefined) {
      return this.shareToken(user, project, dto.token_id, dto.permission);
    }
    const email = normalizeEmail(dto.email ?? '');
    if (email === normalizeEmail(user.email)) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'cannot_share_with_self',
        'You cannot share a list with yourself',
      );
    }
    await this.attempts.assertNamed(`share-invite-user:${user.id}`);
    await this.attempts.assertNamed(`share-invite-email:${email}`);
    await this.attempts.consumeNamed(`share-invite-user:${user.id}`);
    await this.attempts.consumeNamed(`share-invite-email:${email}`);
    const account = await this.prisma.user.findFirst({
      where: { email, deletedAt: null },
      select: { id: true, locale: true, displayName: true },
    });
    try {
      const result = await this.prisma.$transaction((tx) =>
        this.upsertInvite(tx, user, project, email, account?.id ?? null, dto.permission),
      );
      if (result.body.changed === 'created' && account !== null) {
        await this.notifyInvite(account, project.name, user.email, email);
      }
      return result;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainException(HttpStatus.CONFLICT, 'already_member', 'Already a member');
      }
      throw error;
    }
  }

  async updateMember(user: AuthUser, id: string, memberId: string, permission: SharePermission) {
    await this.owner(user, id);
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.projectMember.findFirst({
        where: {
          id: memberId,
          projectId: id,
          deletedAt: null,
          status: { in: ['pending', 'accepted'] },
        },
      });
      if (existing === null) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'member_not_found', 'Member was not found');
      }
      if (existing.permission === permission) {
        return { id: existing.id, permission: existing.permission };
      }
      const saved = await tx.projectMember.update({
        where: { id: existing.id },
        data: { permission },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.projectMemberUpdated,
        entityType: 'project',
        entityId: id,
        action: 'updated',
        data: asJson({ member_id: saved.id, permission }),
        previous: asJson({ permission: existing.permission }),
      });
      return { id: saved.id, permission: saved.permission };
    });
  }

  async unshare(user: AuthUser, id: string, memberId: string): Promise<void> {
    await this.owner(user, id);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.projectMember.updateMany({
        where: {
          id: memberId,
          projectId: id,
          deletedAt: null,
          status: { in: ['pending', 'accepted'] },
        },
        data: { deletedAt: new Date(), status: 'revoked' },
      });
      if (updated.count === 0) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'member_not_found', 'Member was not found');
      }
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.projectUnshared,
        entityType: 'project',
        entityId: id,
        action: 'updated',
        data: asJson({ member_id: memberId }),
        previous: null,
      });
    });
  }

  async leave(user: AuthUser, projectId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.projectMember.findFirst({
        where: {
          projectId,
          memberId: user.id,
          deletedAt: null,
          status: 'accepted',
          tokenId: null,
        },
      });
      if (row === null) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
      }
      await tx.projectMember.update({
        where: { id: row.id },
        data: { status: 'left', deletedAt: new Date(), respondedAt: new Date() },
      });
      if (user.id !== row.ownerId) {
        await this.recordNotice(tx, {
          userId: row.ownerId,
          kind: 'member_left',
          projectId,
          taskId: null,
          actorName: await this.actorName(tx, user.id),
          listName: await this.listName(tx, projectId),
        });
      }
      await this.events.record(
        tx,
        { ...actorOf(user), ownerId: row.ownerId },
        {
          type: DomainEvent.projectLeft,
          entityType: 'project',
          entityId: projectId,
          action: 'updated',
          data: asJson({ member_id: row.id }),
          previous: null,
        },
      );
    });
  }

  async invitations(user: AuthUser) {
    const now = new Date();
    const rows = await this.prisma.projectMember.findMany({
      where: {
        memberId: user.id,
        status: 'pending',
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        project: { select: { id: true, name: true, deletedAt: true, closed: true } },
        owner: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows
        .filter((row) => row.project.deletedAt === null && !row.project.closed)
        .map((row) => ({
          id: row.id,
          project_id: row.projectId,
          project_name: row.project.name,
          owner_name: row.owner.displayName,
          permission: row.permission,
          expires_at: row.expiresAt?.toISOString() ?? null,
        })),
    };
  }

  async respond(user: AuthUser, memberId: string, accept: boolean): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.projectMember.findFirst({
        where: { id: memberId, memberId: user.id, status: 'pending', deletedAt: null },
      });
      if (row === null || (row.expiresAt !== null && row.expiresAt <= new Date())) {
        throw new DomainException(
          HttpStatus.NOT_FOUND,
          'invitation_not_found',
          'Invitation was not found',
        );
      }
      await tx.projectMember.update({
        where: { id: row.id },
        data: accept
          ? { status: 'accepted', respondedAt: new Date() }
          : { status: 'declined', respondedAt: new Date() },
      });
      if (user.id !== row.ownerId) {
        await this.recordNotice(tx, {
          userId: row.ownerId,
          kind: accept ? 'invitation_accepted' : 'invitation_declined',
          projectId: row.projectId,
          taskId: null,
          actorName: await this.actorName(tx, user.id),
          listName: await this.listName(tx, row.projectId),
        });
      }
      await this.events.record(
        tx,
        { ...actorOf(user), ownerId: row.ownerId },
        {
          type: accept
            ? DomainEvent.projectInvitationAccepted
            : DomainEvent.projectInvitationDeclined,
          entityType: 'project',
          entityId: row.projectId,
          action: 'updated',
          data: asJson({ member_id: row.id, permission: row.permission }),
          previous: null,
        },
      );
    });
  }

  async resend(user: AuthUser, projectId: string, memberId: string): Promise<void> {
    const project = await this.owner(user, projectId);
    const row = await this.prisma.projectMember.findFirst({
      where: { id: memberId, projectId, status: 'pending', deletedAt: null },
      include: { member: { select: { email: true, locale: true, displayName: true } } },
    });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'member_not_found', 'Member was not found');
    }
    const email = row.member?.email ?? row.inviteEmail;
    if (email === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'member_not_found', 'Member was not found');
    }
    await this.attempts.assertNamed(`share-invite-user:${user.id}`);
    await this.attempts.consumeNamed(`share-invite-user:${user.id}`);
    const expiresAt = inviteExpiry();
    await this.prisma.projectMember.update({ where: { id: row.id }, data: { expiresAt } });
    if (row.member !== null) {
      await this.notifyInvite(
        { locale: row.member.locale, displayName: row.member.displayName },
        project.name,
        user.email,
        email,
      );
    }
  }

  async owner(user: AuthUser, projectId: string): Promise<Project> {
    const resolved = await this.access.requireRole(user, projectId, 'manage_members');
    return resolved.project;
  }

  async can(user: AuthUser, projectId: string, action: 'read' | 'comment' | 'write') {
    const resolved = await this.access.requireShareAction(user, projectId, action);
    return resolved.project;
  }

  async notices(user: AuthUser) {
    const rows = await this.prisma.shareNotice.findMany({
      where: { userId: user.id, readAt: null },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        kind: row.kind,
        project_id: row.projectId,
        task_id: row.taskId,
        actor_name: row.actorName,
        list_name: row.listName,
        created_at: row.createdAt.toISOString(),
      })),
    };
  }

  async markNoticeRead(user: AuthUser, id: string): Promise<void> {
    const updated = await this.prisma.shareNotice.updateMany({
      where: { id, userId: user.id, readAt: null },
      data: { readAt: new Date() },
    });
    if (updated.count === 0) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'notice_not_found', 'Notice was not found');
    }
  }

  /** RF-1802. Only the owner or an accepted member can be assigned. */
  async assign(user: AuthUser, taskId: string, assigneeId: string | null) {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (task === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    await this.access.requireRole(user, task.projectId, 'assign');
    await this.assertAssignee(task.projectId, assigneeId);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const saved = await tx.task.update({
          where: { id: task.id },
          data: { assigneeId },
        });
        await this.events.record(
          tx,
          { ...actorOf(user), ownerId: task.ownerId },
          {
            type: DomainEvent.taskAssigned,
            entityType: 'task',
            entityId: task.id,
            action: 'assigned',
            data: asJson({ assignee_id: assigneeId }),
            previous: asJson({ assignee_id: task.assigneeId }),
          },
        );
        return { id: saved.id, assignee_id: saved.assigneeId };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
        throw new DomainException(
          HttpStatus.UNPROCESSABLE_ENTITY,
          'invalid_reference',
          'Assignee is not a member of this list',
        );
      }
      throw error;
    }
  }

  async notifyMentions(
    user: AuthUser,
    task: { id: string; projectId: string; ownerId: string },
    body: string,
  ): Promise<void> {
    const wanted = new Set(parseMentions(body));
    if (wanted.size === 0) {
      return;
    }
    const [owner, members, project] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: task.ownerId, deletedAt: null },
        select: { id: true, displayName: true },
      }),
      this.prisma.projectMember.findMany({
        where: {
          projectId: task.projectId,
          status: 'accepted',
          deletedAt: null,
          memberId: { not: null },
        },
        include: { member: { select: { id: true, displayName: true } } },
      }),
      this.prisma.project.findFirst({
        where: { id: task.projectId },
        select: { name: true },
      }),
    ]);
    const people = [
      ...(owner === null ? [] : [{ id: owner.id, name: owner.displayName }]),
      ...members.flatMap((row) =>
        row.member === null ? [] : [{ id: row.member.id, name: row.member.displayName }],
      ),
    ];
    const actorName = await this.actorName(this.prisma, user.id);
    const seen = new Set<string>();
    for (const person of people) {
      if (person.id === user.id || seen.has(person.id) || !wanted.has(mentionKey(person.name))) {
        continue;
      }
      seen.add(person.id);
      await this.prisma.shareNotice.create({
        data: {
          userId: person.id,
          kind: 'mention',
          projectId: task.projectId,
          taskId: task.id,
          actorName,
          listName: project?.name ?? '',
        },
      });
    }
  }

  async previewShare(
    user: AuthUser,
    projectId: string,
    email: string,
    permission: SharePermission,
  ) {
    const project = await this.owner(user, projectId);
    if (project.isInbox) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'inbox_not_shareable',
        'The inbox cannot be shared',
      );
    }
    const normalized = normalizeEmail(email);
    const account = await this.prisma.user.findFirst({
      where: { email: normalized, deletedAt: null },
      select: { id: true },
    });
    const existing =
      account === null
        ? null
        : await this.prisma.projectMember.findFirst({
            where: {
              projectId,
              memberId: account.id,
              deletedAt: null,
              status: { in: ['pending', 'accepted'] },
            },
            select: { id: true, permission: true },
          });
    const taskCount = await this.prisma.task.count({
      where: { projectId, ownerId: user.id, deletedAt: null },
    });
    return {
      shared: false as const,
      preview: {
        list_name: project.name,
        task_count: taskCount,
        email: normalized,
        permission,
        already_member:
          existing === null ? null : { id: existing.id, permission: existing.permission },
      },
      hint: 'Call again with confirm=true to share.',
    };
  }

  private async shareToken(
    user: AuthUser,
    project: Project,
    tokenId: string,
    permission: SharePermission,
  ): Promise<ShareResult> {
    const token = await this.prisma.personalAccessToken.findFirst({
      where: { id: tokenId, ownerId: user.id, revokedAt: null, deletedAt: null },
    });
    if (token === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'token_not_found', 'Token was not found');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.projectMember.findFirst({
          where: { projectId: project.id, tokenId, deletedAt: null },
          orderBy: { updatedAt: 'desc' },
        });
        if (existing !== null && existing.permission === permission) {
          return {
            statusCode: 200,
            body: {
              id: existing.id,
              permission: existing.permission,
              changed: 'unchanged' as const,
              status: 'accepted' as const,
            },
          };
        }
        if (existing !== null) {
          const saved = await tx.projectMember.update({
            where: { id: existing.id },
            data: { permission, status: 'accepted' },
          });
          await this.recordShare(tx, user, project.id, saved.id, permission, existing.permission);
          return {
            statusCode: 200,
            body: {
              id: saved.id,
              permission: saved.permission,
              changed: 'updated',
              status: 'accepted',
            },
          };
        }
        const created = await tx.projectMember.create({
          data: {
            ownerId: user.id,
            projectId: project.id,
            tokenId,
            permission,
            status: 'accepted',
            invitedById: user.id,
          },
        });
        await this.recordShare(tx, user, project.id, created.id, permission, null);
        return {
          statusCode: 201,
          body: {
            id: created.id,
            permission: created.permission,
            changed: 'created',
            status: 'accepted',
          },
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new DomainException(HttpStatus.CONFLICT, 'already_member', 'Already a member');
      }
      throw error;
    }
  }

  private async upsertInvite(
    tx: Tx,
    user: AuthUser,
    project: Project,
    email: string,
    memberId: string | null,
    permission: SharePermission,
  ): Promise<ShareResult> {
    const existing =
      memberId === null
        ? await tx.projectMember.findFirst({
            where: {
              projectId: project.id,
              inviteEmail: email,
              memberId: null,
              deletedAt: null,
              status: 'pending',
            },
          })
        : await tx.projectMember.findFirst({
            where: {
              projectId: project.id,
              memberId,
              deletedAt: null,
              status: { in: ['pending', 'accepted'] },
            },
            orderBy: { updatedAt: 'desc' },
          });
    if (existing !== null && existing.permission === permission) {
      return {
        statusCode: existing.status === 'pending' ? 202 : 200,
        body: {
          id: existing.id,
          permission: existing.permission,
          changed: 'unchanged',
          status: existing.status === 'accepted' ? 'accepted' : 'pending',
        },
      };
    }
    if (existing !== null) {
      const saved = await tx.projectMember.update({
        where: { id: existing.id },
        data: { permission, inviteEmail: email },
      });
      await this.recordShare(tx, user, project.id, saved.id, permission, existing.permission);
      return {
        statusCode: saved.status === 'pending' ? 202 : 200,
        body: {
          id: saved.id,
          permission: saved.permission,
          changed: 'updated',
          status: saved.status === 'accepted' ? 'accepted' : 'pending',
        },
      };
    }
    const created = await tx.projectMember.create({
      data: {
        ownerId: user.id,
        projectId: project.id,
        memberId,
        inviteEmail: email,
        permission,
        status: 'pending',
        invitedById: user.id,
        expiresAt: inviteExpiry(),
      },
    });
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.projectInvited,
      entityType: 'project',
      entityId: project.id,
      action: 'updated',
      data: asJson({ member_id: created.id, permission }),
      previous: null,
    });
    return {
      statusCode: 202,
      body: {
        id: created.id,
        permission: created.permission,
        changed: 'created',
        status: 'pending',
      },
    };
  }

  private async recordShare(
    tx: Tx,
    user: AuthUser,
    projectId: string,
    memberId: string,
    permission: SharePermission,
    previous: SharePermission | null,
  ): Promise<void> {
    await this.events.record(tx, actorOf(user), {
      type: DomainEvent.projectShared,
      entityType: 'project',
      entityId: projectId,
      action: 'updated',
      data: asJson({ member_id: memberId, permission }),
      previous: previous === null ? null : asJson({ permission: previous }),
    });
  }

  private async assertAssignee(projectId: string, assigneeId: string | null): Promise<void> {
    if (assigneeId === null) {
      return;
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
      select: { ownerId: true },
    });
    if (project !== null && assigneeId === project.ownerId) {
      return;
    }
    const seat = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        memberId: assigneeId,
        status: 'accepted',
        deletedAt: null,
        tokenId: null,
      },
      select: { id: true },
    });
    if (seat === null) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'invalid_reference',
        'Assignee is not a member of this list',
      );
    }
  }

  private async recordNotice(
    tx: Tx,
    input: {
      readonly userId: string;
      readonly kind: string;
      readonly projectId: string;
      readonly taskId: string | null;
      readonly actorName: string;
      readonly listName: string;
    },
  ): Promise<void> {
    await tx.shareNotice.create({
      data: {
        userId: input.userId,
        kind: input.kind,
        projectId: input.projectId,
        taskId: input.taskId,
        actorName: input.actorName,
        listName: input.listName,
      },
    });
  }

  private async actorName(tx: Tx | PrismaService, userId: string): Promise<string> {
    const row = await tx.user.findFirst({
      where: { id: userId },
      select: { displayName: true },
    });
    return row?.displayName ?? '';
  }

  private async listName(tx: Tx, projectId: string): Promise<string> {
    const row = await tx.project.findFirst({
      where: { id: projectId },
      select: { name: true },
    });
    return row?.name ?? '';
  }

  private async notifyInvite(
    account: { locale: string; displayName: string },
    listName: string,
    ownerEmail: string,
    to?: string,
  ): Promise<void> {
    const destination = to ?? '';
    if (destination.length === 0 || !emailConfigured()) {
      return;
    }
    const locale = account.locale === 'en' ? 'en' : 'es';
    const mail = renderShareInvitation({
      locale,
      displayName: account.displayName,
      listName,
      ownerName: ownerEmail,
      url: shareSettingsUrl(),
    });
    await sendEmail({ to: destination, subject: mail.subject, text: mail.text, html: mail.html });
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function attachPendingInvites(tx: Tx, userId: string, email: string): Promise<void> {
  await tx.projectMember.updateMany({
    where: {
      inviteEmail: normalizeEmail(email),
      memberId: null,
      status: 'pending',
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    data: { memberId: userId },
  });
}

function inviteExpiry(): Date {
  return new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);
}

function mentionKey(name: string): string {
  const first = name.trim().split(/\s+/)[0] ?? '';
  return first.toLowerCase();
}

function shareSettingsUrl(): string {
  const base = (process.env.PUBLIC_APP_URL ?? process.env.APP_PUBLIC_URL ?? '').replace(/\/$/, '');
  return base.length > 0 ? `${base}/settings/sharing` : '/settings/sharing';
}

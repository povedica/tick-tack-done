import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Project } from '@prisma/client';
import { allows, projectConstraint, type SharePermission } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

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
  };
}

@Injectable()
export class CollaborationService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  async members(user: AuthUser, id: string) {
    await this.can(user, id, 'read');
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId: id, deletedAt: null },
      include: { member: { select: { email: true, displayName: true } } },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        permission: row.permission,
        email: row.member?.email ?? null,
        token_id: row.tokenId,
        display_name: row.member?.displayName ?? null,
      })),
    };
  }

  async share(user: AuthUser, id: string, dto: ShareInput): Promise<ShareResult> {
    const project = await this.owner(user, id);
    if (project.isInbox) {
      throw new DomainException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'inbox_not_shareable',
        'The inbox cannot be shared',
      );
    }
    const member =
      dto.email === undefined
        ? null
        : await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (dto.email !== undefined && member === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'user_not_found', 'User was not found');
    }
    if (dto.token_id !== undefined) {
      const token = await this.prisma.personalAccessToken.findFirst({
        where: { id: dto.token_id, ownerId: user.id, revokedAt: null, deletedAt: null },
      });
      if (token === null) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'token_not_found', 'Token was not found');
      }
    }
    const match =
      member === null && dto.token_id === undefined
        ? []
        : [
            ...(member === null ? [] : [{ memberId: member.id }]),
            ...(dto.token_id === undefined ? [] : [{ tokenId: dto.token_id }]),
          ];
    return this.prisma.$transaction(async (tx) => {
      const existing =
        match.length === 0
          ? null
          : await tx.projectMember.findFirst({
              where: { projectId: id, deletedAt: null, OR: match },
              orderBy: { updatedAt: 'desc' },
            });
      if (existing !== null && existing.permission === dto.permission) {
        return {
          statusCode: 200,
          body: { id: existing.id, permission: existing.permission, changed: 'unchanged' },
        };
      }
      if (existing !== null) {
        const saved = await tx.projectMember.update({
          where: { id: existing.id },
          data: { permission: dto.permission },
        });
        await this.events.record(tx, actorOf(user), {
          type: DomainEvent.projectShared,
          entityType: 'project',
          entityId: id,
          action: 'updated',
          data: asJson({ member_id: saved.id, permission: dto.permission }),
          previous: asJson({ permission: existing.permission }),
        });
        return {
          statusCode: 200,
          body: { id: saved.id, permission: saved.permission, changed: 'updated' },
        };
      }
      const created = await tx.projectMember.create({
        data: {
          ownerId: user.id,
          projectId: id,
          memberId: member?.id ?? null,
          tokenId: dto.token_id ?? null,
          permission: dto.permission,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.projectShared,
        entityType: 'project',
        entityId: id,
        action: 'updated',
        data: asJson({ member_id: created.id, permission: dto.permission }),
        previous: null,
      });
      return {
        statusCode: 201,
        body: { id: created.id, permission: created.permission, changed: 'created' },
      };
    });
  }

  async unshare(user: AuthUser, id: string, memberId: string): Promise<void> {
    await this.owner(user, id);
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.projectMember.updateMany({
        where: { id: memberId, projectId: id, deletedAt: null },
        data: { deletedAt: new Date() },
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

  async owner(user: AuthUser, projectId: string): Promise<Project> {
    const gate = projectConstraint(user.listIds, projectId);
    const project = await this.prisma.project.findFirst({
      where: { id: gate.id ?? projectId, ownerId: user.id, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    return project;
  }

  async can(user: AuthUser, projectId: string, action: 'read' | 'comment' | 'write') {
    const gate = projectConstraint(user.listIds, projectId);
    const project = await this.prisma.project.findFirst({
      where: { id: gate.id ?? projectId, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    if (project.ownerId === user.id) {
      return project;
    }
    const member = await this.prisma.projectMember.findFirst({
      where: {
        projectId,
        deletedAt: null,
        OR: [{ memberId: user.id }, ...(user.tokenId === null ? [] : [{ tokenId: user.tokenId }])],
      },
    });
    if (member === null || !allows(member.permission, action)) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'forbidden', 'Not allowed on this list');
    }
    return project;
  }
}

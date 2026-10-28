import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { allows, type SharePermission } from '@reflexionia/domain';
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

export interface ShareResult {
  readonly statusCode: number;
  readonly body: {
    readonly id: string;
    readonly permission: SharePermission;
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
    await this.owner(user, id);
    const member =
      dto.email === undefined
        ? null
        : await this.prisma.user.findFirst({ where: { email: dto.email, deletedAt: null } });
    if (dto.email !== undefined && member === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'user_not_found', 'User was not found');
    }
    if (dto.token_id !== undefined) {
      const token = await this.prisma.personalAccessToken.findFirst({
        where: { id: dto.token_id, revokedAt: null, deletedAt: null },
      });
      if (token === null) {
        throw new DomainException(HttpStatus.NOT_FOUND, 'token_not_found', 'Token was not found');
      }
    }
    const row = await this.prisma.$transaction(async (tx) => {
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
      return created;
    });
    return { statusCode: 201, body: { id: row.id, permission: row.permission } };
  }

  async unshare(user: AuthUser, id: string, memberId: string): Promise<void> {
    await this.owner(user, id);
    await this.prisma.projectMember.updateMany({
      where: { id: memberId, projectId: id },
      data: { deletedAt: new Date() },
    });
  }

  async owner(user: AuthUser, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: user.id, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
  }

  async can(user: AuthUser, projectId: string, action: 'read' | 'comment' | 'write') {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
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

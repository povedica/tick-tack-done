import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Prisma, Project } from '@prisma/client';
import {
  canDo,
  collaborationAction,
  listVisible,
  type CollaborationAction,
  type SharePermission,
  type ShareRole,
} from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainException } from '../../http/domain.exception.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const NONE = '00000000-0000-0000-0000-000000000000';

export interface AccessSnapshot {
  /** Accepted shared lists the caller may see, strongest permission wins. */
  readonly shared: ReadonlyMap<string, SharePermission>;
}

export interface ResolvedRole {
  readonly project: Project;
  readonly role: ShareRole;
}

@Injectable()
export class ListAccessService {
  private readonly memo = new WeakMap<AuthUser, Promise<AccessSnapshot>>();

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** One membership read per request. RF-1801. */
  snapshot(user: AuthUser): Promise<AccessSnapshot> {
    const cached = this.memo.get(user);
    if (cached !== undefined) {
      return cached;
    }
    const pending = this.load(user);
    this.memo.set(user, pending);
    return pending;
  }

  async roleFor(user: AuthUser, projectId: string): Promise<ShareRole | null> {
    if (!listVisible(user.listIds, projectId)) {
      return null;
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (project === null) {
      return null;
    }
    if (project.ownerId === user.id) {
      return 'owner';
    }
    const access = await this.snapshot(user);
    return access.shared.get(projectId) ?? null;
  }

  /**
   * RF-1801. Missing access is 404 so a stranger cannot tell the list exists.
   * A member without the action gets 403.
   */
  async requireRole(
    user: AuthUser,
    projectId: string,
    action: CollaborationAction,
  ): Promise<ResolvedRole> {
    if (!listVisible(user.listIds, projectId)) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    const role: ShareRole | null =
      project.ownerId === user.id
        ? 'owner'
        : ((await this.snapshot(user)).shared.get(projectId) ?? null);
    if (role === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
    if (!canDo(role, action)) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'forbidden', 'Not allowed on this list');
    }
    return { project, role };
  }

  async requireShareAction(
    user: AuthUser,
    projectId: string,
    action: 'read' | 'comment' | 'write',
  ): Promise<ResolvedRole> {
    return this.requireRole(user, projectId, collaborationAction(action));
  }

  /** Tasks the caller owns, plus every task on an accepted shared list. */
  async taskVisibility(user: AuthUser): Promise<Prisma.TaskWhereInput> {
    const access = await this.snapshot(user);
    const sharedIds = [...access.shared.keys()];
    if (sharedIds.length === 0) {
      return { ownerId: user.id };
    }
    return {
      OR: [{ ownerId: user.id }, { projectId: { in: sharedIds } }],
    };
  }

  /** Smart lists and the calendar only pull shared tasks assigned to the caller. */
  async assignedSharedWhere(user: AuthUser): Promise<Prisma.TaskWhereInput> {
    const access = await this.snapshot(user);
    const sharedIds = [...access.shared.keys()];
    if (sharedIds.length === 0) {
      return { ownerId: user.id };
    }
    return {
      OR: [{ ownerId: user.id }, { projectId: { in: sharedIds }, assigneeId: user.id }],
    };
  }

  private async load(user: AuthUser): Promise<AccessSnapshot> {
    const rows = await this.prisma.projectMember.findMany({
      where: {
        deletedAt: null,
        status: 'accepted',
        OR: [{ memberId: user.id }, ...(user.tokenId === null ? [] : [{ tokenId: user.tokenId }])],
      },
      select: { projectId: true, permission: true },
    });
    const shared = new Map<string, SharePermission>();
    for (const row of rows) {
      if (!listVisible(user.listIds, row.projectId)) {
        continue;
      }
      const current = shared.get(row.projectId);
      if (current === undefined || rank(row.permission) > rank(current)) {
        shared.set(row.projectId, row.permission);
      }
    }
    if (shared.size === 0) {
      return { shared };
    }
    const owned = await this.prisma.project.findMany({
      where: { id: { in: [...shared.keys()] }, ownerId: user.id, deletedAt: null },
      select: { id: true },
    });
    for (const row of owned) {
      shared.delete(row.id);
    }
    return { shared };
  }
}

function rank(permission: SharePermission): number {
  if (permission === 'write') {
    return 3;
  }
  if (permission === 'comment') {
    return 2;
  }
  return 1;
}

export { NONE as NO_LIST };

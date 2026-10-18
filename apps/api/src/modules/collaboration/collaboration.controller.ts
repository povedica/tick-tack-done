import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { allows, parseMentions, type SharePermission } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';

class ShareDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  token_id?: string;

  @ApiProperty({ enum: ['read', 'comment', 'write'] })
  @IsIn(['read', 'comment', 'write'])
  permission!: SharePermission;
}

class CommentDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  body!: string;
}

class AssignDto {
  @ApiProperty({ nullable: true })
  @IsOptional()
  @IsUUID()
  assignee_id!: string | null;
}

@ApiTags('collaboration')
@Controller()
export class CollaborationController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get('projects/:id/members')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'List members of a shared list (RF-1801)' })
  async members(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.can(user, id, 'read');
    const rows = await this.prisma.projectMember.findMany({
      where: { projectId: id, deletedAt: null },
      include: { member: { select: { email: true, displayName: true } } },
    });
    respondJson(
      req,
      res,
      200,
      {
        items: rows.map((row) => ({
          id: row.id,
          permission: row.permission,
          email: row.member?.email ?? null,
          token_id: row.tokenId,
          display_name: row.member?.displayName ?? null,
        })),
      },
      false,
    );
  }

  @Post('projects/:id/members')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Share a list with a user or a token (RF-1801, RF-1805)' })
  async share(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ShareDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.owner(user.id, id);
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
    respondJson(req, res, 201, { id: row.id, permission: row.permission }, false);
  }

  @Delete('projects/:id/members/:memberId')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Remove a member (RF-1801)' })
  async unshare(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.owner(user.id, id);
    await this.prisma.projectMember.updateMany({
      where: { id: memberId, projectId: id },
      data: { deletedAt: new Date() },
    });
    res.status(204).end();
  }

  @Post('projects/:id/presence')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Mark that you are looking at the list (RF-1804)' })
  async presence(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.can(user, id, 'read');
    const row = await this.prisma.listPresence.upsert({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      create: { projectId: id, userId: user.id, seenAt: new Date() },
      update: { seenAt: new Date() },
    });
    await this.prisma.outboxEvent.create({
      data: {
        ownerId: user.id,
        type: DomainEvent.presenceUpdated,
        actorKind: 'user',
        actorId: user.id,
        data: asJson({ project_id: id, seen_at: row.seenAt.toISOString() }),
      },
    });
    const recent = await this.prisma.listPresence.findMany({
      where: { projectId: id, seenAt: { gt: new Date(Date.now() - 2 * 60 * 1000) } },
    });
    respondJson(req, res, 200, { viewers: recent.map((item) => item.userId) }, false);
  }

  @Get('projects/:id/activity')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Activity of a shared list (RF-1803)' })
  async activity(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.can(user, id, 'read');
    const tasks = await this.prisma.task.findMany({
      where: { projectId: id, deletedAt: null },
      select: { id: true },
    });
    const rows = await this.prisma.activityLog.findMany({
      where: { entityId: { in: [id, ...tasks.map((task) => task.id)] } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    respondJson(req, res, 200, { items: rows }, false);
  }

  @Get('tasks/:id/comments')
  @Scopes('tasks:read')
  @ApiOperation({ summary: 'Comments on a task (RF-1803)' })
  async comments(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const task = await this.task(user, id, 'read');
    const rows = await this.prisma.comment.findMany({
      where: { taskId: task.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    respondJson(
      req,
      res,
      200,
      { items: rows.map((row) => ({ id: row.id, body: row.body, author_id: row.authorId, mentions: parseMentions(row.body) })) },
      false,
    );
  }

  @Post('tasks/:id/comments')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Comment, with @mentions (RF-1803)' })
  async comment(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CommentDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const task = await this.task(user, id, 'comment');
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.comment.create({
        data: { ownerId: task.ownerId, taskId: task.id, authorId: user.id, body: dto.body },
      });
      await this.events.record(tx, { ...actorOf(user), ownerId: task.ownerId }, {
        type: DomainEvent.commentCreated,
        entityType: 'comment',
        entityId: created.id,
        action: 'commented',
        data: asJson({ body: dto.body, mentions: parseMentions(dto.body) }),
        previous: null,
      });
      return created;
    });
    respondJson(req, res, 201, { id: row.id, mentions: parseMentions(dto.body) }, false);
  }

  @Post('tasks/:id/assignee')
  @Scopes('tasks:write')
  @ApiOperation({ summary: 'Assign a task (RF-1802)' })
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const task = await this.task(user, id, 'write');
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.task.update({ where: { id: task.id }, data: { assigneeId: dto.assignee_id } });
      await this.events.record(tx, { ...actorOf(user), ownerId: task.ownerId }, {
        type: DomainEvent.taskAssigned,
        entityType: 'task',
        entityId: task.id,
        action: 'assigned',
        data: asJson({ assignee_id: dto.assignee_id }),
        previous: asJson({ assignee_id: task.assigneeId }),
      });
      return saved;
    });
    respondJson(req, res, 200, { id: row.id, assignee_id: row.assigneeId }, false);
  }

  private async owner(userId: string, projectId: string): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, ownerId: userId, deletedAt: null },
    });
    if (project === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'List was not found');
    }
  }

  private async can(user: AuthUser, projectId: string, action: 'read' | 'comment' | 'write') {
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
        OR: [
          { memberId: user.id },
          ...(user.tokenId === null ? [] : [{ tokenId: user.tokenId }]),
        ],
      },
    });
    if (member === null || !allows(member.permission, action)) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'forbidden', 'Not allowed on this list');
    }
    return project;
  }

  private async task(user: AuthUser, taskId: string, action: 'read' | 'comment' | 'write') {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (task === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    await this.can(user, task.projectId, action);
    return task;
  }
}

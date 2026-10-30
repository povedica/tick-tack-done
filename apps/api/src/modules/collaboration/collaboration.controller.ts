import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { parseMentions, type SharePermission } from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { CurrentUser } from '../../auth/current-user.decorator.js';
import { Scopes } from '../../auth/scopes.decorator.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { asJson } from '../../http/json.js';
import { DomainException } from '../../http/domain.exception.js';
import { respondJson } from '../../http/respond.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CollaborationService } from './collaboration.service.js';

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

class PermissionDto {
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
    @Inject(CollaborationService) private readonly collaboration: CollaborationService,
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
    respondJson(req, res, 200, await this.collaboration.members(user, id), false);
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
    const result = await this.collaboration.share(user, id, dto);
    respondJson(req, res, result.statusCode, result.body, false);
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
    await this.collaboration.unshare(user, id, memberId);
    res.status(204).end();
  }

  @Patch('projects/:id/members/:memberId')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Change a member permission (RF-1801)' })
  async updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Body() dto: PermissionDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(
      req,
      res,
      200,
      await this.collaboration.updateMember(user, id, memberId, dto.permission),
      false,
    );
  }

  @Delete('projects/:id/membership')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Leave a shared list (RF-1801)' })
  async leave(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.collaboration.leave(user, id);
    res.status(204).end();
  }

  @Get('me/share-invitations')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Pending list invitations (RF-1801)' })
  async invitations(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.collaboration.invitations(user), false);
  }

  @Post('me/share-invitations/:id/accept')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Accept a list invitation (RF-1801)' })
  async accept(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.collaboration.respond(user, id, true);
    res.status(204).end();
  }

  @Post('me/share-invitations/:id/decline')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Decline a list invitation (RF-1801)' })
  async decline(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.collaboration.respond(user, id, false);
    res.status(204).end();
  }

  @Post('projects/:id/members/:memberId/resend')
  @Scopes('lists:write')
  @ApiOperation({ summary: 'Resend a pending invitation (RF-1801)' })
  async resend(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('memberId', ParseUUIDPipe) memberId: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.collaboration.resend(user, id, memberId);
    res.status(204).end();
  }

  @Get('me/share-notices')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Unread sharing notices (RF-1801, RF-1803)' })
  async notices(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    respondJson(req, res, 200, await this.collaboration.notices(user), false);
  }

  @Post('me/share-notices/:id/read')
  @Scopes('lists:read')
  @ApiOperation({ summary: 'Mark a sharing notice as read (RF-1801)' })
  async readNotice(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.collaboration.markNoticeRead(user, id);
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
    const project = await this.collaboration.can(user, id, 'read');
    const row = await this.prisma.listPresence.upsert({
      where: { projectId_userId: { projectId: id, userId: user.id } },
      create: { projectId: id, userId: user.id, seenAt: new Date() },
      update: { seenAt: new Date() },
    });
    await this.prisma.outboxEvent.create({
      data: {
        ownerId: project.ownerId,
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
    await this.collaboration.can(user, id, 'read');
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
      {
        items: rows.map((row) => ({
          id: row.id,
          body: row.body,
          author_id: row.authorId,
          mentions: parseMentions(row.body),
        })),
      },
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
      await this.events.record(
        tx,
        { ...actorOf(user), ownerId: task.ownerId },
        {
          type: DomainEvent.commentCreated,
          entityType: 'comment',
          entityId: created.id,
          action: 'commented',
          data: asJson({ body: dto.body, mentions: parseMentions(dto.body) }),
          previous: null,
        },
      );
      return created;
    });
    await this.collaboration.notifyMentions(user, task, dto.body);
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
    respondJson(
      req,
      res,
      200,
      await this.collaboration.assign(user, id, dto.assignee_id ?? null),
      false,
    );
  }

  private async task(user: AuthUser, taskId: string, action: 'read' | 'comment' | 'write') {
    const task = await this.prisma.task.findFirst({ where: { id: taskId, deletedAt: null } });
    if (task === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    await this.collaboration.can(user, task.projectId, action);
    return task;
  }
}

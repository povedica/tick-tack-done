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
import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';

class StickyDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  text!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsUUID()
  pinned_task_id?: string | null;
}

class ConvertDto {
  @ApiProperty({ enum: ['task', 'note'] })
  @IsString()
  to!: 'task' | 'note';
}

@ApiTags('notes')
@Controller()
export class NotesController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Get('notes')
  @Scopes('notes:read')
  @ApiOperation({ summary: 'Notes, which are tasks with kind note (RF-1401)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.task.findMany({
      where: { ownerId: user.id, kind: 'note', deletedAt: null },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    respondJson(
      req,
      res,
      200,
      {
        items: rows.map((row) => ({
          id: row.id,
          title: row.title,
          content: row.content,
          project_id: row.projectId,
        })),
      },
      false,
    );
  }

  @Post('tasks/:id/convert')
  @Scopes('notes:write')
  @ApiOperation({ summary: 'Convert a note into a task or the other way (RF-1402)' })
  async convert(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ConvertDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const current = await this.prisma.task.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (current === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'task_not_found', 'Task was not found');
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.task.update({ where: { id }, data: { kind: dto.to } });
      await this.events.record(tx, actorOf(user), {
        type: dto.to === 'note' ? DomainEvent.noteCreated : DomainEvent.noteUpdated,
        entityType: dto.to,
        entityId: id,
        action: 'updated',
        data: asJson({ kind: dto.to }),
        previous: asJson({ kind: current.kind }),
      });
      return saved;
    });
    respondJson(req, res, 200, { id: row.id, kind: row.kind }, false);
  }

  @Get('sticky-notes')
  @Scopes('notes:read')
  @ApiOperation({ summary: 'Sticky notes (RF-1403)' })
  async stickies(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.stickyNote.findMany({
      where: { ownerId: user.id, deletedAt: null },
    });
    respondJson(req, res, 200, { items: rows }, false);
  }

  @Post('sticky-notes')
  @Scopes('notes:write')
  @ApiOperation({ summary: 'Pin a sticky note (RF-1403)' })
  async createSticky(
    @CurrentUser() user: AuthUser,
    @Body() dto: StickyDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.stickyNote.create({
        data: {
          ownerId: user.id,
          text: dto.text,
          color: dto.color ?? null,
          pinnedTaskId: dto.pinned_task_id ?? null,
        },
      });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.stickyNoteCreated,
        entityType: 'sticky_note',
        entityId: created.id,
        action: 'created',
        data: asJson({ text: created.text }),
        previous: null,
      });
      return created;
    });
    respondJson(
      req,
      res,
      201,
      { id: row.id, text: row.text, pinned_task_id: row.pinnedTaskId },
      false,
    );
  }

  @Patch('sticky-notes/:id')
  @Scopes('notes:write')
  @ApiOperation({ summary: 'Update a sticky note (RF-1403)' })
  async updateSticky(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: StickyDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    await this.sticky(user.id, id);
    const row = await this.prisma.stickyNote.update({
      where: { id },
      data: { text: dto.text, color: dto.color ?? null, pinnedTaskId: dto.pinned_task_id ?? null },
    });
    respondJson(req, res, 200, { id: row.id, text: row.text }, false);
  }

  @Delete('sticky-notes/:id')
  @Scopes('notes:write')
  @ApiOperation({ summary: 'Delete a sticky note (RF-1403)' })
  async deleteSticky(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.sticky(user.id, id);
    await this.prisma.$transaction(async (tx) => {
      await tx.stickyNote.update({ where: { id }, data: { deletedAt: new Date() } });
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.stickyNoteDeleted,
        entityType: 'sticky_note',
        entityId: id,
        action: 'deleted',
        data: asJson({ id }),
        previous: null,
      });
    });
    res.status(204).end();
  }

  private async sticky(ownerId: string, id: string): Promise<void> {
    const row = await this.prisma.stickyNote.findFirst({ where: { id, ownerId, deletedAt: null } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'note_not_found', 'Note was not found');
    }
  }
}

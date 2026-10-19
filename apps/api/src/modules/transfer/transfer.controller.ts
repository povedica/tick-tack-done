import { Body, Controller, Get, Header, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import type { Request, Response } from 'express';
import {
  mapCsv,
  tasksToCsv,
  tasksToIcal,
  type CsvExportTask,
  type IcalTask,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { optionalUuid } from '../../http/uuid-query';
import { respondJson } from '../../http/respond';
import { HttpStatus } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

class CsvImportDto {
  @ApiProperty()
  @IsString()
  csv!: string;

  @ApiProperty()
  @IsString()
  title_column!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  due_column?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  priority_column?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsUUID()
  project_id?: string;
}

@ApiTags('import')
@Controller()
export class TransferController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
  ) {}

  @Post('import/csv')
  @Scopes('tasks:write')
  @ApiOperation({
    summary: 'Import a CSV with a column map (RF-1702). TickTick import stays deferred.',
  })
  async importCsv(
    @CurrentUser() user: AuthUser,
    @Body() dto: CsvImportDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const parsed = mapCsv(dto.csv, {
      title: dto.title_column,
      ...(dto.due_column !== undefined ? { due: dto.due_column } : {}),
      ...(dto.priority_column !== undefined ? { priority: dto.priority_column } : {}),
    });
    if (!parsed.ok) {
      throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', parsed.reason);
    }
    const projectId = dto.project_id ?? (await this.inbox(user.id));
    const created = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];
      for (const task of parsed.tasks) {
        const row = await tx.task.create({
          data: {
            ownerId: user.id,
            projectId,
            title: task.title,
            content: task.content,
            dueDate: task.dueDate === null ? null : new Date(task.dueDate),
            priority: task.priority,
            createdById: user.id,
            source: 'import',
          },
        });
        ids.push(row.id);
      }
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.importCompleted,
        entityType: 'project',
        entityId: projectId,
        action: 'created',
        data: asJson({ count: ids.length }),
        previous: null,
      });
      return ids;
    });
    respondJson(req, res, 201, { created: created.length }, false);
  }

  @Get('export/csv')
  @Scopes('backup:read')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({ summary: 'CSV export of a list (RF-1703)' })
  async csv(
    @CurrentUser() user: AuthUser,
    @Query('project_id') projectId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const tasks = await this.rows(user.id, optionalUuid(projectId, 'project_id'));
    const body = tasksToCsv(tasks);
    res.status(200).send(body);
  }

  @Get('export/ical')
  @Scopes('backup:read')
  @Header('Content-Type', 'text/calendar; charset=utf-8')
  @ApiOperation({ summary: 'iCal export of a list or filter (RF-1703)' })
  async ical(
    @CurrentUser() user: AuthUser,
    @Query('project_id') projectId: string | undefined,
    @Res() res: Response,
  ): Promise<void> {
    const tasks = await this.rows(user.id, optionalUuid(projectId, 'project_id'));
    const icalTasks: IcalTask[] = tasks
      .filter((task) => task.dueDate !== null)
      .map((task) => ({
        id: task.title,
        title: task.title,
        content: task.content,
        startDate: null,
        dueDate: task.dueDate,
        isAllDay: false,
      }));
    res.status(200).send(tasksToIcal('Reflexionia', icalTasks, new Date().toISOString()));
  }

  private async rows(ownerId: string, projectId: string | undefined): Promise<CsvExportTask[]> {
    const rows = await this.prisma.task.findMany({
      where: { ownerId, deletedAt: null, ...(projectId === undefined ? {} : { projectId }) },
      include: {
        project: { select: { name: true } },
        tags: { select: { tag: { select: { name: true } } } },
      },
      take: 500,
    });
    return rows.map((row) => ({
      title: row.title,
      content: row.content,
      dueDate: row.dueDate?.toISOString() ?? null,
      priority: row.priority,
      tags: row.tags.map((link) => link.tag.name),
      listName: row.project.name,
      status: row.status,
    }));
  }

  private async inbox(ownerId: string): Promise<string> {
    const inbox = await this.prisma.project.findFirst({
      where: { ownerId, isInbox: true, deletedAt: null },
    });
    if (inbox === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'project_not_found', 'Inbox was not found');
    }
    return inbox.id;
  }
}

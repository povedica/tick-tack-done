import {
  Body,
  Controller,
  Delete,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  Res,
  type OnModuleInit,
} from '@nestjs/common';
import { ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';
import type { Request, Response } from 'express';
import {
  automationMatches,
  parseAutomationAction,
  renderTemplate,
  weeklyNarrative,
  type FilterRules,
  type FilterSubject,
} from '@reflexionia/domain';
import { type AuthUser, type EventActor } from '../../auth/auth-user';
import { telegramConfigured } from '../../integrations/config';
import { CurrentUser } from '../../auth/current-user.decorator';
import { Scopes } from '../../auth/scopes.decorator';
import { safeFetch } from '../../security/safe-fetch';
import type { DomainBusEvent } from '../../events/event-bus';
import { DomainEvent } from '../../events/domain-events';
import { EventRecorder } from '../../events/event-recorder';
import { EventRouter } from '../../events/event-router';
import { asJson } from '../../http/json';
import { DomainException } from '../../http/domain.exception';
import { respondJson } from '../../http/respond';
import { PrismaService } from '../../prisma/prisma.service';
import { loadDashboardSnapshot } from '../../reading/snapshot';

class AutomationDto {
  @ApiProperty()
  @IsString()
  @MaxLength(200)
  name!: string;

  @ApiProperty()
  trigger!: Record<string, unknown>;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  conditions?: Record<string, unknown> | null;

  @ApiProperty({ type: 'array' })
  @IsArray()
  actions!: unknown[];

  @ApiProperty({ required: false })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

@Injectable()
export class AutomationEngine implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(EventRouter) private readonly router: EventRouter,
  ) {}

  onModuleInit(): void {
    this.router.subscribe((event) => this.onEvent(event));
  }

  async onEvent(event: DomainBusEvent): Promise<void> {
    if (event.type === DomainEvent.automationExecuted || event.ownerId.length === 0) {
      return;
    }
    const rules = await this.prisma.automation.findMany({
      where: { ownerId: event.ownerId, deletedAt: null, enabled: true },
    });
    for (const rule of rules) {
      const trigger = rule.trigger as { event?: string };
      if (trigger.event !== event.type) {
        continue;
      }
      await this.run(rule.id, event.ownerId, event.id, event.type);
    }
  }

  async run(id: string, ownerId: string, eventId: string | null, eventType: string): Promise<void> {
    const rule = await this.prisma.automation.findFirst({
      where: { id, ownerId, deletedAt: null },
    });
    if (rule === null) {
      return;
    }
    const actions = Array.isArray(rule.actions) ? rule.actions : [];
    const parsed = actions
      .map((action) => parseAutomationAction(action))
      .filter((action) => action !== null);
    const subject = await this.subject(ownerId);
    const conditions = rule.conditions as FilterRules | null;
    const clock = { now: new Date().toISOString(), timeZone: 'Europe/Madrid' };
    if (subject !== null && !automationMatches(conditions, subject, clock)) {
      return;
    }
    const detail: string[] = [];
    for (const action of parsed) {
      detail.push(await this.apply(ownerId, action, eventType));
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.automationRun.create({
        data: { automationId: rule.id, eventId, state: 'ok', detail: asJson({ steps: detail }) },
      });
      await this.events.record(
        tx,
        {
          ownerId,
          actorId: ownerId,
          actorKind: 'automation',
          tokenId: null,
        },
        {
          type: DomainEvent.automationExecuted,
          entityType: 'automation',
          entityId: rule.id,
          action: 'updated',
          data: asJson({ event: eventType, steps: detail }),
          previous: null,
        },
      );
    });
  }

  private async apply(
    ownerId: string,
    action: NonNullable<ReturnType<typeof parseAutomationAction>>,
    eventType: string,
  ): Promise<string> {
    const actor = this.actor(ownerId);
    if (action.type === 'create_task') {
      const title = renderTemplate(action.title, {
        now: new Date().toISOString(),
        'task.title': eventType,
      });
      const project = await this.project(ownerId, action.project);
      if (project === null) {
        return 'no_inbox';
      }
      await this.prisma.$transaction(async (tx) => {
        const created = await tx.task.create({
          data: {
            ownerId,
            projectId: project.id,
            title: title.slice(0, 500),
            createdById: ownerId,
            source: 'automation',
          },
        });
        await this.events.record(tx, actor, {
          type: DomainEvent.taskCreated,
          entityType: 'task',
          entityId: created.id,
          action: 'created',
          data: asJson({ title: created.title }),
          previous: null,
        });
      });
      return 'create_task';
    }
    if (action.type === 'notify') {
      if (action.channel === 'telegram' && !telegramConfigured()) {
        return 'telegram_not_configured';
      }
      if (action.channel === 'report') {
        return this.writeReport(ownerId, actor);
      }
      return 'notify';
    }
    if (action.type === 'webhook') {
      try {
        const response = await safeFetch(action.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ event: eventType }),
          maxBytes: 64 * 1024,
        });
        return response.status >= 200 && response.status < 300 ? 'webhook' : 'webhook_failed';
      } catch {
        return 'webhook_failed';
      }
    }
    if (action.type === 'run_plugin_action') {
      const install = await this.prisma.pluginInstall.findFirst({
        where: { ownerId, pluginId: action.plugin_id, enabled: true, deletedAt: null },
      });
      return install === null ? 'plugin_missing' : 'run_plugin_action';
    }
    const task = await this.prisma.task.findFirst({
      where: { ownerId, deletedAt: null, status: 'active' },
      orderBy: { updatedAt: 'desc' },
    });
    if (task === null) {
      return 'no_task';
    }
    if (action.type === 'set_priority') {
      await this.touch(actor, task.id, { priority: action.priority }, { priority: task.priority });
      return 'set_priority';
    }
    if (action.type === 'reschedule') {
      await this.touch(
        actor,
        task.id,
        { dueDate: new Date(action.due) },
        { due_date: task.dueDate?.toISOString() ?? null },
      );
      return 'reschedule';
    }
    if (action.type === 'move_to_list') {
      const project = await this.project(ownerId, action.project);
      if (project === null) {
        return 'no_list';
      }
      await this.touch(actor, task.id, { projectId: project.id }, { project_id: task.projectId });
      return 'move_to_list';
    }
    const tag = await this.prisma.tag.upsert({
      where: { ownerId_name: { ownerId, name: action.tag } },
      create: { ownerId, name: action.tag },
      update: { deletedAt: null },
    });
    if (action.type === 'add_tag') {
      await this.prisma.taskTag.createMany({
        data: [{ taskId: task.id, tagId: tag.id }],
        skipDuplicates: true,
      });
    } else {
      await this.prisma.taskTag.deleteMany({ where: { taskId: task.id, tagId: tag.id } });
    }
    await this.prisma.$transaction(async (tx) => {
      await this.events.record(tx, actor, {
        type: DomainEvent.taskUpdated,
        entityType: 'task',
        entityId: task.id,
        action: 'updated',
        data: asJson({ tag: action.tag, op: action.type }),
        previous: null,
      });
    });
    return action.type;
  }

  private actor(ownerId: string): EventActor {
    return { ownerId, actorId: ownerId, actorKind: 'automation', tokenId: null };
  }

  private async project(ownerId: string, nameOrId: string) {
    if (/^[0-9a-f-]{36}$/i.test(nameOrId)) {
      return this.prisma.project.findFirst({ where: { id: nameOrId, ownerId, deletedAt: null } });
    }
    if (nameOrId === 'inbox') {
      return this.prisma.project.findFirst({ where: { ownerId, isInbox: true, deletedAt: null } });
    }
    return this.prisma.project.findFirst({ where: { ownerId, name: nameOrId, deletedAt: null } });
  }

  private async touch(
    actor: EventActor,
    taskId: string,
    data: { priority?: 'none' | 'low' | 'medium' | 'high'; dueDate?: Date; projectId?: string },
    previous: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.task.update({ where: { id: taskId }, data });
      await this.events.record(tx, actor, {
        type: DomainEvent.taskUpdated,
        entityType: 'task',
        entityId: taskId,
        action: 'updated',
        data: asJson(data),
        previous: asJson(previous),
      });
    });
  }

  private async writeReport(ownerId: string, actor: EventActor): Promise<string> {
    const now = new Date();
    const snapshot = await loadDashboardSnapshot(this.prisma, ownerId, now);
    const narrative = weeklyNarrative(snapshot, 'honesto', null);
    const week = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - now.getUTCDay()),
    );
    await this.prisma.$transaction(async (tx) => {
      const saved = await tx.weeklyReport.upsert({
        where: { ownerId_weekStart: { ownerId, weekStart: week } },
        create: {
          ownerId,
          weekStart: week,
          payload: asJson({ summary: narrative.summary, observations: narrative.observations }),
          tone: 'honesto',
        },
        update: {
          payload: asJson({ summary: narrative.summary, observations: narrative.observations }),
          tone: 'honesto',
        },
      });
      await this.events.record(tx, actor, {
        type: DomainEvent.reportGenerated,
        entityType: 'weekly_report',
        entityId: saved.id,
        action: 'created',
        data: asJson({ week: week.toISOString().slice(0, 10) }),
        previous: null,
      });
    });
    return narrative.summary.slice(0, 80);
  }

  private async subject(ownerId: string): Promise<FilterSubject | null> {
    const task = await this.prisma.task.findFirst({
      where: { ownerId, deletedAt: null, status: 'active' },
      include: { tags: { select: { tag: { select: { name: true } } } } },
      orderBy: { updatedAt: 'desc' },
    });
    if (task === null) {
      return null;
    }
    return {
      listId: task.projectId,
      tagNames: task.tags.map((link) => link.tag.name),
      dueDate: task.dueDate?.toISOString() ?? null,
      isAllDay: task.isAllDay,
      timeZone: task.timeZone,
      priority: task.priority,
      title: task.title,
      content: task.content,
      status: task.status,
      assigneeId: task.assigneeId,
      deleted: false,
      createdAt: task.createdAt.toISOString(),
    };
  }
}

@ApiTags('automations')
@Controller('automations')
export class AutomationsController {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AutomationEngine) private readonly engine: AutomationEngine,
  ) {}

  @Get()
  @Scopes('automations:manage')
  @ApiOperation({ summary: 'List automations (section 11.3)' })
  async list(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const rows = await this.prisma.automation.findMany({
      where: { ownerId: user.id, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    respondJson(req, res, 200, { items: rows }, false);
  }

  @Post()
  @Scopes('automations:manage')
  @ApiOperation({ summary: 'Create an automation (section 11.3)' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: AutomationDto,
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.automation.create({
      data: {
        ownerId: user.id,
        name: dto.name,
        trigger: asJson(dto.trigger),
        ...(dto.conditions == null ? {} : { conditions: asJson(dto.conditions) }),
        actions: asJson(dto.actions),
        enabled: dto.enabled ?? true,
      },
    });
    respondJson(req, res, 201, row, false);
  }

  @Post(':id/run')
  @Scopes('automations:manage')
  @ApiOperation({
    summary: 'Run an automation now, including the weekly report template (RF-2203)',
  })
  async run(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    const row = await this.prisma.automation.findFirst({
      where: { id, ownerId: user.id, deletedAt: null },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'automation_not_found',
        'Automation was not found',
      );
    }
    const trigger = row.trigger as { event?: string; cron?: string };
    await this.engine.run(id, user.id, null, trigger.event ?? trigger.cron ?? 'manual');
    res.status(204).end();
  }

  @Delete(':id')
  @Scopes('automations:manage')
  @ApiOperation({ summary: 'Delete an automation' })
  async remove(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Res() res: Response,
  ): Promise<void> {
    await this.prisma.automation.updateMany({
      where: { id, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    res.status(204).end();
  }
}

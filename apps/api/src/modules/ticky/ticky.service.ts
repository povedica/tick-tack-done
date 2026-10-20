import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus, Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  approvalMatches,
  buildContextSnapshot,
  intersectOwnedLists,
  legacyGrantsTickyScope,
  occupiedIntervals,
  ProposalError,
  readCapabilities,
  TICKY_FINE_SCOPES,
  TICKY_READ_SCOPES,
  type ProposalBody,
} from '@reflexionia/domain';
import { actorOf, type AuthUser } from '../../auth/auth-user.js';
import { requireBrowserSession } from '../../auth/session-access.js';
import { newPersonalAccessToken } from '../../auth/token-secret.js';
import { DomainEvent } from '../../events/domain-events.js';
import { EventRecorder } from '../../events/event-recorder.js';
import { EventRouter } from '../../events/event-router.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson } from '../../http/json.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { applyAuthorizedTaskChange, parseProposalDocument } from '../tasks/ticky-task-command.js';
import { tickyFlags } from './ticky-flags.js';
import { signTickyJwt, type TickyAudience } from './ticky-jwt.js';

const PROPOSAL_TOOLS: Record<string, string> = {
  'tasks.create': 'tasks:create',
  'tasks.update': 'tasks:update',
  'tasks.complete': 'tasks:complete',
  'tasks.trash': 'tasks:trash',
};

const hits = new Map<string, number[]>();
const streams = new Map<string, number>();

@Injectable()
export class TickyService implements OnModuleInit {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(EventRecorder) private readonly events: EventRecorder,
    @Inject(EventRouter) private readonly router: EventRouter,
  ) {}

  onModuleInit(): void {
    this.router.subscribe(async (event) => {
      if (event.type !== DomainEvent.tickyAuthorityUpdated) {
        return;
      }
      await this.pushAuthority(event.ownerId, event.id);
    });
  }

  flags(): ReturnType<typeof tickyFlags> {
    return tickyFlags();
  }

  async capabilities(user: AuthUser): Promise<Record<string, unknown>> {
    if (!tickyFlags().read) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_not_ready',
        'La lectura de Ticky no está activada.',
      );
    }
    const authority = await this.prisma.tickyAuthority.findUnique({
      where: { ownerId: user.id },
      include: { lists: true },
    });
    if (authority === null || authority.revoked || user.listIds === null) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_not_ready',
        'No hay una credencial de lectura acotada a listas.',
      );
    }
    const granted = new Set(authority.lists.map((row) => row.listId));
    const listIds = user.listIds.filter((id) => granted.has(id));
    const body = readCapabilities({
      ownerId: user.id,
      listIds,
      scopes: user.scopes.filter((scope) => (TICKY_READ_SCOPES as readonly string[]).includes(scope)),
    });
    if (!body.scopes.includes('tasks:read')) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'scope_missing', 'Falta tasks:read.');
    }
    return { ...body };
  }

  async updateAuthority(
    user: AuthUser,
    patch: {
      list_ids?: readonly string[];
      autonomy?: number;
      paused?: boolean;
      revoked?: boolean;
      inbox_list_id?: string | null;
      action_scopes?: readonly string[];
      workday_start?: string | null;
      workday_end?: string | null;
      coaching_silence?: unknown;
      reminder_silence?: unknown;
      estimate_learning_enabled?: boolean;
    },
  ): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    if (patch.autonomy !== undefined && patch.autonomy > 2) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'autonomy_not_granted',
        'A3 y A4 no se conceden desde una preferencia.',
      );
    }
    const owned = await this.ownedLists(user.id);
    const listIds =
      patch.list_ids === undefined ? null : intersectOwnedLists(owned, patch.list_ids);
    if (patch.list_ids !== undefined && listIds !== null && listIds.length !== new Set(patch.list_ids).size) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'shared_lists_excluded',
        'Las listas compartidas quedan fuera hasta una decisión explícita.',
      );
    }
    const saved = await this.prisma.$transaction(async (tx) => {
      const current = await tx.tickyAuthority.upsert({
        where: { ownerId: user.id },
        create: { ownerId: user.id, version: 1 },
        update: {},
      });
      const version = current.version + 1;
      const authority = await tx.tickyAuthority.update({
        where: { id: current.id },
        data: {
          version,
          ...(patch.autonomy === undefined ? {} : { autonomy: patch.autonomy }),
          ...(patch.paused === undefined ? {} : { paused: patch.paused }),
          ...(patch.revoked === undefined ? {} : { revoked: patch.revoked }),
          ...(patch.inbox_list_id === undefined ? {} : { inboxListId: patch.inbox_list_id }),
          ...(patch.action_scopes === undefined
            ? {}
            : {
                actionScopes: patch.action_scopes.filter((scope) =>
                  (TICKY_FINE_SCOPES as readonly string[]).includes(scope),
                ),
              }),
          ...(patch.workday_start === undefined ? {} : { workdayStart: patch.workday_start }),
          ...(patch.workday_end === undefined ? {} : { workdayEnd: patch.workday_end }),
          ...(patch.estimate_learning_enabled === undefined
            ? {}
            : { estimateLearningEnabled: patch.estimate_learning_enabled }),
          ...(patch.coaching_silence === undefined ? {} : { coachingSilence: asJson(patch.coaching_silence) }),
          ...(patch.reminder_silence === undefined ? {} : { reminderSilence: asJson(patch.reminder_silence) }),
        },
      });
      if (listIds !== null) {
        await tx.tickyListGrant.deleteMany({ where: { authorityId: authority.id } });
        if (listIds.length > 0) {
          await tx.tickyListGrant.createMany({
            data: listIds.map((listId) => ({ authorityId: authority.id, listId })),
          });
        }
      }
      const lists = await tx.tickyListGrant.findMany({ where: { authorityId: authority.id } });
      const eventId = randomUUID();
      await this.events.record(tx, actorOf(user), {
        type: DomainEvent.tickyAuthorityUpdated,
        entityType: 'ticky_authority',
        entityId: authority.id,
        action: 'updated',
        data: asJson({
          id: eventId,
          version: authority.version,
          list_ids: lists.map((row) => row.listId),
          autonomy: authority.autonomy,
          revoked: authority.revoked,
          paused: authority.paused,
        }),
        previous: null,
      });
      await tx.tickyBridgeDelivery.create({
        data: {
          ownerId: user.id,
          eventId,
          kind: 'authority',
          status: 'pending',
        },
      });
      return { authority, lists, eventId };
    });
    await this.pushAuthority(user.id, saved.eventId);
    return this.authorityView(saved.authority, saved.lists.map((row) => row.listId));
  }

  async issueReader(user: AuthUser): Promise<{ token: string; prefix: string }> {
    requireBrowserSession(user);
    const authority = await this.prisma.tickyAuthority.findUnique({
      where: { ownerId: user.id },
      include: { lists: true },
    });
    if (authority === null || authority.revoked || authority.lists.length === 0) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'ticky_not_ready',
        'Concede antes listas propias. No se emite un token de cuenta completa.',
      );
    }
    const issued = newPersonalAccessToken();
    await this.prisma.personalAccessToken.create({
      data: {
        ownerId: user.id,
        name: 'ticky-reader',
        tokenHash: issued.hash,
        tokenPrefix: issued.prefix,
        scopes: [...TICKY_READ_SCOPES],
        listRestricted: true,
        listIds: authority.lists.map((row) => row.listId),
      },
    });
    return { token: issued.token, prefix: issued.prefix };
  }

  async storeProposal(user: AuthUser, document: string): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    const body = await parseProposalDocument(document, user.id);
    const row = await this.prisma.tickyProposal.create({
      data: {
        id: body.proposal_id,
        ownerId: user.id,
        runId: body.run_id,
        authorityVersion: body.authority_version,
        timezone: body.timezone,
        expiresAt: new Date(body.expires_at),
        digest: body.approval_digest ?? '',
        body: asJson(body),
      },
    });
    return { proposal_id: row.id, approval_digest: row.digest, expires_at: row.expiresAt.toISOString() };
  }

  async approve(
    user: AuthUser,
    proposalId: string,
    digest: string,
    selected: readonly string[],
  ): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.limit(user.id, 'approve');
    if (!tickyFlags().execution) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'execution_disabled', 'El executor está apagado.');
    }
    const row = await this.prisma.tickyProposal.findFirst({ where: { id: proposalId, ownerId: user.id } });
    if (row === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'proposal_not_found', 'No hay esa propuesta.');
    }
    const body = row.body as unknown as ProposalBody;
    const now = new Date().toISOString();
    try {
      await approvalMatches(
        body,
        {
          owner_id: user.id,
          proposal_id: proposalId,
          digest,
          selected_actions: selected,
          approved_at: now,
        },
        user.id,
        now,
      );
    } catch (error) {
      if (error instanceof ProposalError) {
        throw new DomainException(HttpStatus.CONFLICT, error.code, 'La aprobación no coincide.');
      }
      throw error;
    }
    const authority = await this.requireAuthority(user.id);
    const results = [];
    for (const actionId of selected) {
      results.push(await this.applyOne(user, body, actionId, authority));
    }
    return { proposal_id: proposalId, results };
  }

  async actionStatus(user: AuthUser, actionId: string): Promise<Record<string, unknown>> {
    const row = await this.prisma.tickyActionLedger.findUnique({
      where: { ownerId_actionId: { ownerId: user.id, actionId } },
    });
    if (row === null) {
      return {
        status: 'unknown',
        message: 'No he podido confirmar si se aplicó; no lo repetiré todavía.',
      };
    }
    return { status: row.status, digest: row.digest, result: row.result, tombstone: row.tombstone };
  }

  async context(user: AuthUser): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    const authority = await this.requireAuthority(user.id);
    const subs = await this.prisma.calendarSubscription.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { lastSyncedAt: true, lastError: true, visible: true },
    });
    const events = await this.prisma.externalEvent.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { startsAt: true, endsAt: true, isAllDay: true, status: true, timeZone: true },
    });
    const busy = occupiedIntervals({
      subscriptions: subs.map((row) => ({
        lastSyncedAt: row.lastSyncedAt?.toISOString() ?? null,
        lastError: row.lastError,
        visible: row.visible,
      })),
      events: events.map((row) => ({
        startsAt: row.startsAt.toISOString(),
        endsAt: row.endsAt?.toISOString() ?? null,
        isAllDay: row.isAllDay,
        status: row.status,
        timeZone: row.timeZone,
      })),
      nowIso: new Date().toISOString(),
      freshWithinMs: 15 * 60 * 1000,
    });
    const workday =
      authority.workdayStart === null || authority.workdayEnd === null
        ? null
        : { start: authority.workdayStart, end: authority.workdayEnd };
    const snapshot = buildContextSnapshot({
      authorityVersion: authority.version,
      sourceRevision: authority.sourceRevision,
      issuedAt: new Date().toISOString(),
      timeZone: user.timeZone,
      workday,
      calendar: busy === null ? null : { busy },
      review: user.scopes.includes('tasks:read') ? null : null,
      taskEnergy: [],
      durationObservations: [],
    });
    return { ...snapshot };
  }

  async postMessage(
    user: AuthUser,
    threadId: string,
    clientMessageId: string,
    text: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    requireBrowserSession(user);
    this.limit(user.id, 'chat');
    const thread = await this.prisma.tickyThread.findFirst({
      where: { id: threadId, ownerId: user.id, deletedAt: null },
    });
    if (thread === null) {
      throw new DomainException(HttpStatus.NOT_FOUND, 'thread_not_found', 'El hilo no es de esta cuenta.');
    }
    const fingerprint = createHash('sha256').update(text).digest('hex');
    const existing = await this.prisma.tickyClientMessage.findUnique({
      where: { ownerId_clientMessageId: { ownerId: user.id, clientMessageId } },
    });
    if (existing !== null) {
      if (existing.fingerprint !== fingerprint) {
        throw new DomainException(HttpStatus.CONFLICT, 'idempotency_conflict', 'Ese mensaje ya se envió con otro texto.');
      }
      return { status: existing.statusCode, body: existing.response as Record<string, unknown> };
    }
    if (!tickyFlags().model) {
      const body = {
        type: 'guidance',
        status: 'model_not_configured',
        message: 'El modelo no está configurado. No se ha llamado a ningún proveedor.',
      };
      await this.prisma.tickyClientMessage.create({
        data: {
          ownerId: user.id,
          threadId,
          clientMessageId,
          fingerprint,
          statusCode: 200,
          response: asJson(body),
        },
      });
      return { status: 200, body };
    }
    const authority = await this.requireAuthority(user.id);
    const run = await this.python('POST', '/internal/v1/runs', 'ticky-runs', user.id, authority.version, {
      client_message_id: clientMessageId,
      thread_id: threadId,
      text,
      timezone: user.timeZone,
    });
    await this.prisma.tickyClientMessage.create({
      data: {
        ownerId: user.id,
        threadId,
        clientMessageId,
        fingerprint,
        statusCode: run.status,
        response: asJson(run.body),
        ...(typeof run.body.run_id === 'string' ? { runId: run.body.run_id } : {}),
      },
    });
    return run;
  }

  async openThread(user: AuthUser): Promise<{ id: string }> {
    requireBrowserSession(user);
    const id = randomUUID();
    await this.prisma.tickyThread.create({ data: { id, ownerId: user.id } });
    return { id };
  }

  async listThreads(user: AuthUser): Promise<{ items: { id: string }[] }> {
    const rows = await this.prisma.tickyThread.findMany({
      where: { ownerId: user.id, deletedAt: null },
      select: { id: true },
      orderBy: { createdAt: 'desc' },
    });
    return { items: rows };
  }

  async deleteThread(user: AuthUser, id: string): Promise<void> {
    requireBrowserSession(user);
    await this.prisma.tickyThread.updateMany({
      where: { id, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async cancelRun(user: AuthUser, runId: string): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.limit(user.id, 'cancel');
    const authority = await this.requireAuthority(user.id);
    return (
      await this.python('POST', `/internal/v1/runs/${runId}/cancel`, 'ticky-runs', user.id, authority.version, {})
    ).body;
  }

  async streamRunEvents(
    user: AuthUser,
    runId: string,
    cursor: string | undefined,
    req: { on: (event: string, listener: () => void) => void },
    res: {
      flushHeaders: () => void;
      write: (chunk: string) => void;
      end: () => void;
      status: (code: number) => { end: () => void };
    },
  ): Promise<void> {
    requireBrowserSession(user);
    this.acquireStream(user.id);
    const release = (): void => {
      this.releaseStream(user.id);
    };
    req.on('close', release);
    if (!tickyFlags().ui || process.env.TICKY_SERVICE_URL === undefined || process.env.TICKY_SERVICE_URL.length === 0) {
      res.status(503).end();
      release();
      return;
    }
    res.flushHeaders();
    const authority = await this.requireAuthority(user.id);
    let token = '';
    try {
      token = signTickyJwt({
        audience: 'ticky-runs',
        subject: user.id,
        authorityVersion: authority.version,
      });
    } catch {
      res.write(`event: failed\ndata: ${JSON.stringify({ code: 'ticky_not_ready' })}\n\n`);
      res.end();
      release();
      return;
    }
    const url = new URL(`/internal/v1/runs/${runId}/events`, process.env.TICKY_SERVICE_URL);
    if (cursor !== undefined && cursor.length > 0) {
      url.searchParams.set('cursor', cursor);
    }
    try {
      const response = await fetch(url, {
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'text/event-stream',
          ...(cursor === undefined || cursor.length === 0 ? {} : { 'Last-Event-ID': cursor }),
        },
        signal: AbortSignal.timeout(65_000),
      });
      if (!response.ok || response.body === null) {
        res.write(
          `event: failed\ndata: ${JSON.stringify({ code: 'upstream', status: response.status })}\n\n`,
        );
        res.end();
        release();
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const chunk = await reader.read();
        if (chunk.done) {
          break;
        }
        res.write(decoder.decode(chunk.value, { stream: true }));
      }
      res.end();
    } catch {
      res.write(`event: failed\ndata: ${JSON.stringify({ code: 'stream_interrupted' })}\n\n`);
      res.end();
    } finally {
      release();
    }
  }

  async listRoutines(user: AuthUser): Promise<{
    items: {
      id: string;
      version: number;
      paused: boolean;
      shadow: boolean;
      window_minutes: number;
      next_at: string | null;
      schedule_issue: string | null;
    }[];
  }> {
    const rows = await this.prisma.tickyRoutine.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        version: row.version,
        paused: row.paused,
        shadow: row.shadow,
        window_minutes: row.windowMinutes,
        next_at: row.nextAt?.toISOString() ?? null,
        schedule_issue: row.scheduleIssue,
      })),
    };
  }

  async forgetMemory(user: AuthUser, id: string): Promise<void> {
    requireBrowserSession(user);
    await this.prisma.tickyMemory.updateMany({
      where: { id, ownerId: user.id, forgottenAt: null },
      data: { forgottenAt: new Date() },
    });
  }

  async remember(user: AuthUser, body: string, sourceMessageId: string | null): Promise<{ id: string }> {
    requireBrowserSession(user);
    const row = await this.prisma.tickyMemory.create({
      data: { ownerId: user.id, body, sourceMessageId },
    });
    return { id: row.id };
  }

  async listMemories(user: AuthUser): Promise<{ items: { id: string; version: number; body: string }[] }> {
    const rows = await this.prisma.tickyMemory.findMany({
      where: { ownerId: user.id, forgottenAt: null },
      select: { id: true, version: true, body: true },
    });
    return { items: rows };
  }

  acquireStream(ownerId: string): void {
    const current = streams.get(ownerId) ?? 0;
    if (current >= 2) {
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Demasiadas conexiones abiertas.');
    }
    streams.set(ownerId, current + 1);
  }

  releaseStream(ownerId: string): void {
    streams.set(ownerId, Math.max(0, (streams.get(ownerId) ?? 1) - 1));
  }

  private async applyOne(
    user: AuthUser,
    body: ProposalBody,
    actionId: string,
    authority: { version: number; revoked: boolean; paused: boolean; scopes: readonly string[]; listIds: readonly string[] },
  ): Promise<Record<string, unknown>> {
    const item = body.items.find((candidate) => candidate.action_id === actionId);
    if (item === undefined) {
      throw new DomainException(HttpStatus.CONFLICT, 'invalid_selection', 'La acción no está en la propuesta.');
    }
    if (authority.revoked || authority.paused || authority.version !== body.authority_version) {
      throw new DomainException(HttpStatus.CONFLICT, 'authority_revoked', 'La autoridad cambió. No se aplica.');
    }
    const required = PROPOSAL_TOOLS[item.tool];
    if (required === undefined || !legacyGrantsTickyScope(authority.scopes, required)) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'scope_missing', 'Esa acción no está concedida.');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const prior = await tx.tickyActionLedger.findUnique({
          where: { ownerId_actionId: { ownerId: user.id, actionId } },
        });
        if (prior !== null) {
          if (prior.digest !== body.approval_digest) {
            throw new DomainException(HttpStatus.CONFLICT, 'digest_mismatch', 'Esa acción ya se aplicó con otro digest.');
          }
          return { action_id: actionId, replayed: true, result: prior.result };
        }
        const scoped: AuthUser = { ...user, listIds: authority.listIds };
        const result = await applyAuthorizedTaskChange(
          tx,
          this.events,
          scoped,
          item,
          { proposalId: body.proposal_id, runId: body.run_id },
          body.timezone,
        );
        await tx.tickyActionLedger.create({
          data: {
            ownerId: user.id,
            actionId,
            proposalId: body.proposal_id,
            runId: body.run_id,
            digest: body.approval_digest ?? '',
            status: 'applied',
            result: asJson(result),
          },
        });
        return { action_id: actionId, replayed: false, result };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const prior = await this.prisma.tickyActionLedger.findUnique({
          where: { ownerId_actionId: { ownerId: user.id, actionId } },
        });
        if (prior !== null && prior.digest === body.approval_digest) {
          return { action_id: actionId, replayed: true, result: prior.result };
        }
        throw new DomainException(HttpStatus.CONFLICT, 'digest_mismatch', 'Esa acción ya se aplicó con otro digest.');
      }
      throw error;
    }
  }

  private async requireAuthority(ownerId: string): Promise<{
    version: number;
    revoked: boolean;
    paused: boolean;
    scopes: readonly string[];
    listIds: readonly string[];
    workdayStart: string | null;
    workdayEnd: string | null;
    sourceRevision: number;
  }> {
    const authority = await this.prisma.tickyAuthority.findUnique({
      where: { ownerId },
      include: { lists: true },
    });
    if (authority === null) {
      throw new DomainException(HttpStatus.CONFLICT, 'ticky_not_ready', 'No hay autoridad Ticky.');
    }
    return {
      version: authority.version,
      revoked: authority.revoked,
      paused: authority.paused,
    scopes: authority.actionScopes,
      listIds: authority.lists.map((row) => row.listId),
      workdayStart: authority.workdayStart,
      workdayEnd: authority.workdayEnd,
      sourceRevision: authority.sourceRevision,
    };
  }

  private async ownedLists(ownerId: string): Promise<string[]> {
    const rows = await this.prisma.project.findMany({
      where: { ownerId, deletedAt: null },
      select: { id: true },
    });
    return rows.map((row) => row.id);
  }

  private authorityView(
    authority: { version: number; autonomy: number; revoked: boolean; paused: boolean },
    listIds: readonly string[],
  ): Record<string, unknown> {
    return {
      version: authority.version,
      autonomy: authority.autonomy,
      revoked: authority.revoked,
      paused: authority.paused,
      list_ids: listIds,
      fine_scopes: [...TICKY_FINE_SCOPES],
      flags: tickyFlags(),
    };
  }

  private limit(ownerId: string, bucket: string): void {
    const key = `${ownerId}:${bucket}`;
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < 60_000);
    if (recent.length >= 30) {
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Demasiadas peticiones. Espera un minuto.');
    }
    recent.push(now);
    hits.set(key, recent);
  }

  private async pushAuthority(ownerId: string, eventId: string): Promise<void> {
    const base = process.env.TICKY_SERVICE_URL ?? '';
    if (base.length === 0) {
      return;
    }
    const authority = await this.prisma.tickyAuthority.findUnique({
      where: { ownerId },
      include: { lists: true },
    });
    if (authority === null) {
      return;
    }
    try {
      const token = signTickyJwt({
        audience: 'ticky-events',
        subject: ownerId,
        authorityVersion: authority.version,
      });
      const response = await fetch(new URL('/internal/v1/events', base), {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          event_type: 'authority.updated',
          scopes: [...TICKY_READ_SCOPES],
          list_ids: authority.lists.map((row) => row.listId),
          autonomy: authority.autonomy,
          revoked: authority.revoked,
          version: authority.version,
          inbox_list_id: authority.inboxListId,
        }),
      });
      await this.prisma.tickyBridgeDelivery.updateMany({
        where: { ownerId, eventId, kind: 'authority' },
        data: { status: response.ok ? 'delivered' : 'pending', attempts: { increment: 1 } },
      });
    } catch {
      await this.prisma.tickyBridgeDelivery.updateMany({
        where: { ownerId, eventId, kind: 'authority' },
        data: { status: 'pending', attempts: { increment: 1 }, nextRetryAt: new Date(Date.now() + 30_000) },
      });
    }
  }

  private async python(
    method: string,
    path: string,
    audience: TickyAudience,
    ownerId: string,
    authorityVersion: number,
    body: unknown,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const base = process.env.TICKY_SERVICE_URL ?? '';
    if (base.length === 0) {
      throw new DomainException(HttpStatus.SERVICE_UNAVAILABLE, 'ticky_unavailable', 'El servicio Ticky no está configurado.');
    }
    let token = '';
    try {
      token = signTickyJwt({ audience, subject: ownerId, authorityVersion });
    } catch {
      throw new DomainException(HttpStatus.SERVICE_UNAVAILABLE, 'ticky_not_ready', 'Falta la clave de firma del BFF.');
    }
    const response = await fetch(new URL(path, base), {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
        prefer: 'respond-async',
      },
      body: JSON.stringify(body),
    });
    const payload = (await response.json()) as Record<string, unknown>;
    return { status: response.status, body: payload };
  }
}

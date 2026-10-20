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
import { pythonContext } from './python-context.js';

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
    if (
      authority === null ||
      authority.revoked ||
      authority.paused ||
      authority.autonomy === 0 ||
      user.listIds === null
    ) {
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
      scopes: user.scopes.filter((scope) =>
        (TICKY_READ_SCOPES as readonly string[]).includes(scope),
      ),
    });
    if (!body.scopes.includes('tasks:read')) {
      throw new DomainException(HttpStatus.FORBIDDEN, 'scope_missing', 'Falta tasks:read.');
    }
    return { ...body };
  }

  async authority(user: AuthUser): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    const authority = await this.prisma.tickyAuthority.findUnique({
      where: { ownerId: user.id },
      include: { lists: true },
    });
    const owned = await this.ownedLists(user.id);
    if (authority === null)
      return {
        configured: false,
        version: null,
        autonomy: 0,
        paused: false,
        revoked: false,
        list_ids: [],
        action_scopes: [],
        owned_list_ids: owned,
        workday_start: null,
        workday_end: null,
        inbox_list_id: null,
        fine_scopes: [...TICKY_FINE_SCOPES],
      };
    return {
      ...this.authorityView(
        authority,
        authority.lists.map((row) => row.listId),
      ),
      configured: true,
      owned_list_ids: owned,
    };
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
    if (
      (patch.list_ids !== undefined && patch.list_ids.length > 10) ||
      (patch.autonomy !== undefined && (!Number.isInteger(patch.autonomy) || patch.autonomy < 0))
    ) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        'authority_invalid',
        'Revisa el nivel de ayuda y el máximo de diez listas.',
      );
    }
    const owned = await this.ownedLists(user.id);
    const listIds =
      patch.list_ids === undefined ? null : intersectOwnedLists(owned, patch.list_ids);
    if (
      patch.list_ids !== undefined &&
      listIds !== null &&
      listIds.length !== new Set(patch.list_ids).size
    ) {
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
      await tx.$queryRaw(
        Prisma.sql`SELECT id FROM ticky_authorities WHERE owner_id = ${user.id}::uuid FOR UPDATE`,
      );
      const locked = await tx.tickyAuthority.findUniqueOrThrow({ where: { ownerId: user.id } });
      const version = locked.version + 1;
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
          ...(patch.coaching_silence === undefined
            ? {}
            : { coachingSilence: asJson(patch.coaching_silence) }),
          ...(patch.reminder_silence === undefined
            ? {}
            : { reminderSilence: asJson(patch.reminder_silence) }),
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
      if (
        [authority.workdayStart, authority.workdayEnd].some(
          (value) => value !== null && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value),
        ) ||
        (authority.workdayStart === null) !== (authority.workdayEnd === null) ||
        (authority.workdayStart !== null &&
          authority.workdayEnd !== null &&
          authority.workdayEnd <= authority.workdayStart)
      ) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'workday_invalid',
          'Indica inicio y fin de jornada, con el fin posterior al inicio, o deja ambos vacíos.',
        );
      }
      const lists = await tx.tickyListGrant.findMany({ where: { authorityId: authority.id } });
      if (
        authority.inboxListId !== null &&
        !lists.some((list) => list.listId === authority.inboxListId)
      ) {
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'inbox_not_granted',
          'La bandeja de captura debe ser una lista propia concedida.',
        );
      }
      if (listIds !== null) {
        // Existing dedicated reader credentials follow only the owner's explicit grants.
        await tx.personalAccessToken.updateMany({
          where: { ownerId: user.id, name: 'ticky-reader', revokedAt: null },
          data: {
            scopes: [...TICKY_READ_SCOPES],
            listRestricted: true,
            listIds: lists.map((list) => list.listId),
          },
        });
      }
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
    return this.authorityView(
      saved.authority,
      saved.lists.map((row) => row.listId),
    );
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
    const row = await this.prisma.tickyProposal.upsert({
      where: { id: body.proposal_id },
      update: {},
      create: {
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
    if (row.ownerId !== user.id || row.digest !== body.approval_digest) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'proposal_conflict',
        'La propuesta ya tiene otro contenido.',
      );
    }
    return {
      proposal_id: row.id,
      approval_digest: row.digest,
      expires_at: row.expiresAt.toISOString(),
    };
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
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'execution_disabled',
        'El executor está apagado.',
      );
    }
    const row = await this.prisma.tickyProposal.findFirst({
      where: { id: proposalId, ownerId: user.id },
    });
    if (row === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'proposal_not_found',
        'No hay esa propuesta.',
      );
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
    this.requireReadEnabled();
    const authority = await this.requireAuthority(user.id);
    const revision = await this.prisma.tickyAuthority.update({
      where: { ownerId: user.id, version: authority.version },
      data: { sourceRevision: { increment: 1 } },
      select: { sourceRevision: true },
    });
    const calendarGranted = authority.scopes.includes('calendar:read');
    const subs = calendarGranted
      ? await this.prisma.calendarSubscription.findMany({
          where: { ownerId: user.id, deletedAt: null, visible: true },
          select: { lastSyncedAt: true, lastError: true, visible: true },
        })
      : [];
    const events = calendarGranted
      ? await this.prisma.externalEvent.findMany({
          where: {
            ownerId: user.id,
            deletedAt: null,
            subscription: { ownerId: user.id, deletedAt: null, visible: true },
          },
          select: { startsAt: true, endsAt: true, isAllDay: true, status: true, timeZone: true },
        })
      : [];
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
      sourceRevision: revision.sourceRevision,
      issuedAt: new Date().toISOString(),
      timeZone: user.timeZone,
      workday,
      calendar: busy === null || !authority.scopes.includes('calendar:read') ? null : { busy },
      review: user.scopes.includes('tasks:read') ? null : null,
      taskEnergy: [],
      durationObservations: [],
    });
    const canonical = pythonContext(snapshot);
    await this.python(
      'POST',
      '/internal/v1/context',
      'ticky-context',
      user.id,
      authority.version,
      canonical,
    );
    return canonical;
  }

  async postMessage(
    user: AuthUser,
    threadId: string,
    clientMessageId: string,
    text: string,
    modelId?: string,
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    this.limit(user.id, 'chat');
    const thread = await this.prisma.tickyThread.findFirst({
      where: { id: threadId, ownerId: user.id, deletedAt: null },
    });
    if (thread === null) {
      throw new DomainException(
        HttpStatus.NOT_FOUND,
        'thread_not_found',
        'El hilo no es de esta cuenta.',
      );
    }
    const fingerprint = createHash('sha256')
      .update(modelId === undefined ? text : JSON.stringify([text, modelId]))
      .digest('hex');
    const existing = await this.prisma.tickyClientMessage.findUnique({
      where: { ownerId_clientMessageId: { ownerId: user.id, clientMessageId } },
    });
    if (existing !== null) {
      if (existing.fingerprint !== fingerprint || existing.threadId !== threadId) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'idempotency_conflict',
          'Ese mensaje ya se envió con otro texto.',
        );
      }
      // Python revalidates retention, authority and canonical run state on replay.
    }
    const authority = await this.requireAuthority(user.id);
    if (modelId !== undefined && !tickyFlags().model) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'model_not_configured',
        'La generación no está activada. Puedes consultar sin IA.',
      );
    }
    if (modelId !== undefined && existing === null) {
      await this.context(user);
    }
    const run = await this.python(
      'POST',
      '/internal/v1/runs',
      'ticky-runs',
      user.id,
      authority.version,
      {
        client_message_id: clientMessageId,
        thread_id: threadId,
        text,
        timezone: user.timeZone,
        ...(modelId === undefined ? {} : { model_id: modelId }),
      },
    );
    const projection = {
      statusCode: run.status,
      response: asJson(run.body),
      ...(typeof run.body.run_id === 'string' ? { runId: run.body.run_id } : {}),
    };
    await this.prisma.tickyClientMessage.upsert({
      where: { ownerId_clientMessageId: { ownerId: user.id, clientMessageId } },
      create: { ownerId: user.id, threadId, clientMessageId, fingerprint, ...projection },
      update: projection,
    });
    return run;
  }

  async models(user: AuthUser): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    if (!tickyFlags().model) {
      return { items: [] };
    }
    const authority = await this.requireAuthority(user.id);
    return (
      await this.python(
        'GET',
        '/internal/v1/models',
        'ticky-runs',
        user.id,
        authority.version,
        undefined,
      )
    ).body;
  }

  async openThread(user: AuthUser): Promise<{ id: string }> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    const authority = await this.requireAuthority(user.id);
    const result = await this.python(
      'POST',
      '/internal/v1/threads',
      'ticky-runs',
      user.id,
      authority.version,
      undefined,
    );
    const id = result.body.thread_id;
    if (
      typeof id !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
    ) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'El servicio no devolvió un hilo válido.',
      );
    }
    await this.prisma.tickyThread.create({ data: { id, ownerId: user.id } });
    return { id };
  }

  async listThreads(user: AuthUser): Promise<{ items: { id: string }[]; next_before: unknown }> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    const authority = await this.requireAuthority(user.id);
    const page = (
      await this.python(
        'GET',
        '/internal/v1/threads',
        'ticky-runs',
        user.id,
        authority.version,
        undefined,
      )
    ).body;
    if (!Array.isArray(page.threads)) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'El historial no es válido.',
      );
    }
    const items: { id: string }[] = [];
    const rows: readonly unknown[] = page.threads;
    for (const row of rows) {
      if (
        row === null ||
        typeof row !== 'object' ||
        !('thread_id' in row) ||
        typeof row.thread_id !== 'string'
      ) {
        throw new DomainException(
          HttpStatus.BAD_GATEWAY,
          'ticky_invalid_response',
          'El historial no es válido.',
        );
      }
      const id = row.thread_id;
      const existing = await this.prisma.tickyThread.findUnique({ where: { id } });
      if (existing !== null && existing.ownerId !== user.id) {
        throw new DomainException(
          HttpStatus.CONFLICT,
          'thread_owner_conflict',
          'No se ha podido verificar el hilo.',
        );
      }
      await this.prisma.tickyThread.upsert({
        where: { id },
        create: { id, ownerId: user.id },
        update: {},
      });
      items.push({ id });
    }
    return { items, next_before: page.next_before ?? null };
  }

  async threadMessages(user: AuthUser, id: string): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    const authority = await this.requireAuthority(user.id);
    return (
      await this.python(
        'GET',
        `/internal/v1/threads/${id}/messages`,
        'ticky-runs',
        user.id,
        authority.version,
        undefined,
      )
    ).body;
  }

  async deleteThread(user: AuthUser, id: string): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    const authority = await this.requireAuthority(user.id);
    const result = (
      await this.python(
        'DELETE',
        `/internal/v1/threads/${id}`,
        'ticky-runs',
        user.id,
        authority.version,
        undefined,
      )
    ).body;
    if (result.state !== 'pending' && result.state !== 'deleted') {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'No se ha podido confirmar el borrado.',
      );
    }
    // Python owns history/erasure. The local row only prevents reuse of this projection.
    await this.prisma.tickyThread.updateMany({
      where: { id, ownerId: user.id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    await this.prisma.tickyClientMessage.updateMany({
      where: { ownerId: user.id, threadId: id },
      data: { response: {}, runId: null, statusCode: 410 },
    });
    return result;
  }

  async cancelRun(user: AuthUser, runId: string): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.limit(user.id, 'cancel');
    const authority = await this.requireAuthority(user.id);
    return (
      await this.python(
        'POST',
        `/internal/v1/runs/${runId}/cancel`,
        'ticky-runs',
        user.id,
        authority.version,
        {},
      )
    ).body;
  }

  async streamRunEvents(
    user: AuthUser,
    runId: string,
    cursor: string | undefined,
    req: { on: (event: string, listener: () => void) => void },
    res: {
      on: (event: string, listener: () => void) => void;
      flushHeaders: () => void;
      write: (chunk: string) => void;
      end: () => void;
      status: (code: number) => { end: () => void };
    },
  ): Promise<void> {
    requireBrowserSession(user);
    this.acquireStream(user.id);
    const disconnected = new AbortController();
    let released = false;
    const release = (): void => {
      if (released) {
        return;
      }
      released = true;
      disconnected.abort();
      this.releaseStream(user.id);
    };
    res.on('close', release);
    req.on('aborted', release);
    if (
      !tickyFlags().ui ||
      process.env.TICKY_SERVICE_URL === undefined ||
      process.env.TICKY_SERVICE_URL.length === 0
    ) {
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
        signal: AbortSignal.any([disconnected.signal, AbortSignal.timeout(65_000)]),
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
        if (!(chunk.value instanceof Uint8Array)) {
          throw new Error('invalid_stream_chunk');
        }
        res.write(decoder.decode(chunk.value, { stream: true }));
      }
      res.end();
    } catch {
      if (!disconnected.signal.aborted) {
        res.write(`event: failed\ndata: ${JSON.stringify({ code: 'stream_interrupted' })}\n\n`);
        res.end();
      }
    } finally {
      release();
    }
  }

  async listRoutines(user: AuthUser): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireRoutinesEnabled();
    const authority = await this.requireAuthority(user.id);
    return (
      await this.python(
        'GET',
        '/internal/v1/routines',
        'ticky-runs',
        user.id,
        authority.version,
        undefined,
      )
    ).body;
  }

  async createRoutine(user: AuthUser, draft: object): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireRoutinesEnabled();
    const authority = await this.requireAuthority(user.id);
    this.requireRoutineWrite(authority.scopes);
    return (
      await this.python(
        'POST',
        '/internal/v1/routines',
        'ticky-runs',
        user.id,
        authority.version,
        draft,
      )
    ).body;
  }

  async updateRoutine(user: AuthUser, id: string, draft: object): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireRoutinesEnabled();
    const authority = await this.requireAuthority(user.id);
    this.requireRoutineWrite(authority.scopes);
    return (
      await this.python(
        'PUT',
        `/internal/v1/routines/${id}`,
        'ticky-runs',
        user.id,
        authority.version,
        draft,
      )
    ).body;
  }

  async pauseRoutine(user: AuthUser, id: string): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireRoutinesEnabled();
    const authority = await this.requireAuthority(user.id);
    this.requireRoutineWrite(authority.scopes);
    return (
      await this.python(
        'POST',
        `/internal/v1/routines/${id}/pause`,
        'ticky-runs',
        user.id,
        authority.version,
        undefined,
      )
    ).body;
  }

  async forgetMemory(user: AuthUser, id: string): Promise<void> {
    requireBrowserSession(user);
    const authority = await this.requireAuthority(user.id);
    await this.python(
      'DELETE',
      `/internal/v1/memory/${id}`,
      'ticky-runs',
      user.id,
      authority.version,
      undefined,
    );
  }

  async remember(
    user: AuthUser,
    kind: string,
    value: string,
    sourceMessageId: string,
  ): Promise<{ id: string }> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    const authority = await this.requireAuthority(user.id);
    const result = await this.python(
      'POST',
      '/internal/v1/memory',
      'ticky-runs',
      user.id,
      authority.version,
      {
        kind,
        value,
        source_message_id: sourceMessageId,
      },
    );
    if (typeof result.body.memory_id !== 'string') {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'La memoria no es válida.',
      );
    }
    return { id: result.body.memory_id };
  }

  async listMemories(user: AuthUser): Promise<Record<string, unknown>> {
    requireBrowserSession(user);
    this.requireReadEnabled();
    const authority = await this.requireAuthority(user.id);
    const result = await this.python(
      'GET',
      '/internal/v1/memory',
      'ticky-runs',
      user.id,
      authority.version,
      undefined,
    );
    if (!Array.isArray(result.body.preferences)) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'La memoria no es válida.',
      );
    }
    return { items: result.body.preferences };
  }

  acquireStream(ownerId: string): void {
    const current = streams.get(ownerId) ?? 0;
    if (current >= 2) {
      throw new DomainException(
        HttpStatus.TOO_MANY_REQUESTS,
        'rate_limited',
        'Demasiadas conexiones abiertas.',
      );
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
    authority: {
      version: number;
      revoked: boolean;
      paused: boolean;
      scopes: readonly string[];
      listIds: readonly string[];
    },
  ): Promise<Record<string, unknown>> {
    const item = body.items.find((candidate) => candidate.action_id === actionId);
    if (item === undefined) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'invalid_selection',
        'La acción no está en la propuesta.',
      );
    }
    if (authority.revoked || authority.paused || authority.version !== body.authority_version) {
      throw new DomainException(
        HttpStatus.CONFLICT,
        'authority_revoked',
        'La autoridad cambió. No se aplica.',
      );
    }
    const required = PROPOSAL_TOOLS[item.tool];
    if (required === undefined || !legacyGrantsTickyScope(authority.scopes, required)) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'scope_missing',
        'Esa acción no está concedida.',
      );
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw(
          Prisma.sql`SELECT id FROM ticky_authorities WHERE owner_id = ${user.id}::uuid FOR UPDATE`,
        );
        const current = await tx.tickyAuthority.findUnique({
          where: { ownerId: user.id },
          include: { lists: true },
        });
        if (
          current === null ||
          current.revoked ||
          current.paused ||
          current.autonomy < 2 ||
          current.version !== body.authority_version
        ) {
          throw new DomainException(
            HttpStatus.CONFLICT,
            'authority_revoked',
            'La autoridad cambió. No se aplica.',
          );
        }
        if (!legacyGrantsTickyScope(current.actionScopes, required)) {
          throw new DomainException(
            HttpStatus.FORBIDDEN,
            'scope_missing',
            'Esa acción ya no está concedida.',
          );
        }
        const prior = await tx.tickyActionLedger.findUnique({
          where: { ownerId_actionId: { ownerId: user.id, actionId } },
        });
        if (prior !== null) {
          if (prior.digest !== body.approval_digest) {
            throw new DomainException(
              HttpStatus.CONFLICT,
              'digest_mismatch',
              'Esa acción ya se aplicó con otro digest.',
            );
          }
          return { action_id: actionId, replayed: true, result: prior.result };
        }
        const scoped: AuthUser = { ...user, listIds: current.lists.map((row) => row.listId) };
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
        throw new DomainException(
          HttpStatus.CONFLICT,
          'digest_mismatch',
          'Esa acción ya se aplicó con otro digest.',
        );
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
    authority: {
      version: number;
      autonomy: number;
      revoked: boolean;
      paused: boolean;
      actionScopes?: readonly string[];
      workdayStart?: string | null;
      workdayEnd?: string | null;
      inboxListId?: string | null;
    },
    listIds: readonly string[],
  ): Record<string, unknown> {
    return {
      version: authority.version,
      autonomy: authority.autonomy,
      revoked: authority.revoked,
      paused: authority.paused,
      action_scopes: authority.actionScopes ?? [],
      workday_start: authority.workdayStart ?? null,
      workday_end: authority.workdayEnd ?? null,
      inbox_list_id: authority.inboxListId ?? null,
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
      throw new DomainException(
        HttpStatus.TOO_MANY_REQUESTS,
        'rate_limited',
        'Demasiadas peticiones. Espera un minuto.',
      );
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
        signal: AbortSignal.timeout(10_000),
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          event_id: eventId,
          event_type: 'authority.updated',
          scopes: [
            ...TICKY_READ_SCOPES,
            ...authority.actionScopes.filter((scope) =>
              ['calendar:read', 'ticky:routines:read', 'ticky:routines:write'].includes(scope),
            ),
          ],
          list_ids: authority.lists.map((row) => row.listId),
          autonomy: authority.paused ? 0 : authority.autonomy,
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
        data: {
          status: 'pending',
          attempts: { increment: 1 },
          nextRetryAt: new Date(Date.now() + 30_000),
        },
      });
    }
  }

  private upstreamStatus(status: number): HttpStatus {
    switch (status) {
      case 400:
        return HttpStatus.BAD_REQUEST;
      case 401:
        return HttpStatus.UNAUTHORIZED;
      case 403:
        return HttpStatus.FORBIDDEN;
      case 404:
        return HttpStatus.NOT_FOUND;
      case 409:
        return HttpStatus.CONFLICT;
      case 422:
        return HttpStatus.UNPROCESSABLE_ENTITY;
      case 429:
        return HttpStatus.TOO_MANY_REQUESTS;
      default:
        return HttpStatus.BAD_GATEWAY;
    }
  }

  private requireReadEnabled(): void {
    if (!tickyFlags().read) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_not_ready',
        'La lectura de Ticky no está activada.',
      );
    }
  }

  private requireRoutinesEnabled(): void {
    this.requireReadEnabled();
    if (!tickyFlags().routines) {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_routines_not_ready',
        'La gestión de rutinas de Ticky no está activada.',
      );
    }
  }

  private requireRoutineWrite(scopes: readonly string[]): void {
    if (!scopes.includes('ticky:routines:write')) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'ticky_routine_permission_required',
        'Concede el permiso de edición de rutinas antes de continuar.',
      );
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
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_unavailable',
        'El servicio Ticky no está configurado.',
      );
    }
    let token = '';
    try {
      token = signTickyJwt({ audience, subject: ownerId, authorityVersion });
    } catch {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_not_ready',
        'Falta la clave de firma del BFF.',
      );
    }
    let response: Response;
    try {
      response = await fetch(new URL(path, base), {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          prefer: 'respond-async',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(65_000),
      });
    } catch {
      throw new DomainException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'ticky_unavailable',
        'No se ha podido confirmar la respuesta de Ticky. Revisa el historial antes de repetir.',
      );
    }
    if (!response.ok) {
      throw new DomainException(
        this.upstreamStatus(response.status),
        'ticky_upstream_rejected',
        'Ticky no ha aceptado la solicitud.',
      );
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'La respuesta de Ticky no es válida.',
      );
    }
    if (
      method === 'GET' &&
      ['/internal/v1/models', '/internal/v1/routines'].includes(path) &&
      Array.isArray(payload)
    ) {
      return { status: response.status, body: { items: payload } };
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw new DomainException(
        HttpStatus.BAD_GATEWAY,
        'ticky_invalid_response',
        'La respuesta de Ticky no es válida.',
      );
    }
    return { status: response.status, body: payload as Record<string, unknown> };
  }
}

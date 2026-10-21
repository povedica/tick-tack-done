import { createHash, randomUUID } from 'node:crypto';
import { HttpStatus } from '@nestjs/common';
import {
  actionBlocked,
  proposalDigest,
  validateProposal,
  ProposalError,
  type ProposalBody,
  type ProposalItem,
} from '@reflexionia/domain';
import type { AuthUser } from '../../auth/auth-user.js';
import { DomainEvent } from '../../events/domain-events.js';
import type { EventRecorder } from '../../events/event-recorder.js';
import { DomainException } from '../../http/domain.exception.js';
import { asJson } from '../../http/json.js';
import type { Tx } from '../../prisma/tx.js';

const SORT = 65536n;

export async function applyAuthorizedTaskChange(
  tx: Tx,
  events: EventRecorder,
  user: AuthUser,
  item: ProposalItem,
  correlation: { readonly proposalId: string; readonly runId: string },
  timeZone: string,
): Promise<Record<string, unknown>> {
  const blocked = actionBlocked(item);
  if (blocked !== null) {
    throw new DomainException(HttpStatus.CONFLICT, blocked, blockedMessage(blocked));
  }
  const linked = { ...correlation, actionId: item.action_id };
  if (item.tool === 'tasks.create') {
    return createTask(tx, events, user, item, linked, timeZone);
  }
  return updateTask(tx, events, user, item, linked);
}

function blockedMessage(code: 'side_effects_undescribed' | 'title_needs_edit'): string {
  if (code === 'title_needs_edit') {
    return 'El título supera el máximo de la aplicación. Edítalo antes de aprobar; no se trunca.';
  }
  return 'Completar o enviar a la papelera queda bloqueado hasta que el diff describa los efectos sobre hijos y checklist.';
}

async function createTask(
  tx: Tx,
  events: EventRecorder,
  user: AuthUser,
  item: ProposalItem,
  correlation: { readonly proposalId: string; readonly runId: string; readonly actionId: string },
  timeZone: string,
): Promise<Record<string, unknown>> {
  const title = item.after.title;
  if (typeof title !== 'string' || title.trim().length === 0) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'empty_title', 'El título es obligatorio.');
  }
  const projectId = item.after.project_id;
  if (typeof projectId !== 'string') {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'project_required',
      'La lista de destino es obligatoria.',
    );
  }
  if (!visible(user, projectId)) {
    throw new DomainException(
      HttpStatus.FORBIDDEN,
      'list_not_granted',
      'La lista no está concedida a Ticky.',
    );
  }
  await assertOwnedList(tx, user.id, projectId);
  const due = dueDate(item.after) ?? null;
  const row = await tx.task.create({
    data: {
      id: item.resource_id,
      ownerId: user.id,
      projectId,
      title: title.trim(),
      content: '',
      dueDate: due,
      timeZone,
      createdById: user.id,
      source: 'api',
      sortOrder: SORT,
      version: 1,
    },
    select: { id: true, projectId: true, version: true },
  });
  await record(
    tx,
    events,
    user,
    row.id,
    row.projectId,
    row.version,
    DomainEvent.taskCreated,
    correlation,
  );
  return { resource_id: row.id, version: row.version, applied: true };
}

async function updateTask(
  tx: Tx,
  events: EventRecorder,
  user: AuthUser,
  item: ProposalItem,
  correlation: { readonly proposalId: string; readonly runId: string; readonly actionId: string },
): Promise<Record<string, unknown>> {
  const current = await tx.task.findFirst({
    where: { id: item.resource_id, ownerId: user.id, deletedAt: null },
    select: { id: true, projectId: true, version: true },
  });
  if (current === null || !visible(user, current.projectId)) {
    throw new DomainException(
      HttpStatus.NOT_FOUND,
      'task_not_found',
      'La tarea no está en las listas autorizadas.',
    );
  }
  if (item.after.project_id !== undefined && item.after.project_id !== null) {
    if (!visible(user, item.after.project_id)) {
      throw new DomainException(
        HttpStatus.FORBIDDEN,
        'list_not_granted',
        'La lista de destino no está concedida a Ticky.',
      );
    }
    await assertOwnedList(tx, user.id, item.after.project_id);
  }
  const data: {
    title?: string;
    dueDate?: Date | null;
    projectId?: string;
  } = {};
  if (typeof item.after.title === 'string') {
    data.title = item.after.title.trim();
  }
  if ('due_at' in item.after) {
    data.dueDate = dueDate(item.after) ?? null;
  }
  if (typeof item.after.project_id === 'string') {
    data.projectId = item.after.project_id;
  }
  const updated = await tx.task.updateMany({
    where: {
      id: current.id,
      ownerId: user.id,
      version: item.expected_version,
      deletedAt: null,
      projectId: current.projectId,
    },
    data,
  });
  if (updated.count !== 1) {
    throw new DomainException(
      HttpStatus.CONFLICT,
      'proposal_stale',
      'La tarea cambió desde la vista previa. No se ha aplicado.',
    );
  }
  const saved = await tx.task.findFirst({
    where: { id: current.id },
    select: { id: true, projectId: true, version: true },
  });
  if (saved === null) {
    throw new DomainException(
      HttpStatus.CONFLICT,
      'proposal_stale',
      'La tarea cambió desde la vista previa.',
    );
  }
  await record(
    tx,
    events,
    user,
    saved.id,
    saved.projectId,
    saved.version,
    DomainEvent.taskUpdated,
    correlation,
  );
  return { resource_id: saved.id, version: saved.version, applied: true };
}

async function record(
  tx: Tx,
  events: EventRecorder,
  user: AuthUser,
  taskId: string,
  projectId: string,
  version: number,
  type: string,
  correlation: { readonly proposalId: string; readonly runId: string; readonly actionId: string },
): Promise<void> {
  await events.record(
    tx,
    { ownerId: user.id, actorId: user.id, actorKind: 'user', tokenId: user.tokenId },
    {
      type,
      entityType: 'task',
      entityId: taskId,
      action: type.endsWith('created@v1') ? 'created' : 'updated',
      data: asJson({
        id: taskId,
        project_id: projectId,
        version,
        proposal_id: correlation.proposalId,
        run_id: correlation.runId,
        action_id: correlation.actionId,
      }),
      previous: null,
    },
  );
}

async function assertOwnedList(tx: Tx, ownerId: string, listId: string): Promise<void> {
  const project = await tx.project.findFirst({
    where: { id: listId, ownerId, deletedAt: null },
    select: { id: true },
  });
  if (project === null) {
    throw new DomainException(
      HttpStatus.FORBIDDEN,
      'list_not_granted',
      'La lista no es propia o no está concedida.',
    );
  }
}

function visible(user: AuthUser, projectId: string): boolean {
  return user.listIds == null || user.listIds.includes(projectId);
}

function dueDate(changes: ProposalItem['after']): Date | null | undefined {
  if (!('due_at' in changes)) {
    return undefined;
  }
  if (changes.due_at === null) {
    return null;
  }
  const parsed = new Date(changes.due_at);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'due_at no es una fecha válida.',
    );
  }
  return parsed;
}

export async function parseProposalDocument(
  document: string,
  ownerId: string,
): Promise<ProposalBody> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(document);
  } catch {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'proposal_invalid',
      'La propuesta no es JSON válido.',
    );
  }
  if (typeof parsed !== 'object' || parsed === null) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'proposal_invalid',
      'La propuesta no es válida.',
    );
  }
  const body = parsed as ProposalBody;
  if (body.owner_id !== ownerId) {
    throw new DomainException(
      HttpStatus.FORBIDDEN,
      'owner_mismatch',
      'La propuesta es de otra cuenta.',
    );
  }
  try {
    await validateProposal(body);
  } catch (error) {
    if (error instanceof ProposalError) {
      throw new DomainException(
        HttpStatus.BAD_REQUEST,
        error.code,
        'La propuesta no cumple el contrato.',
      );
    }
    throw error;
  }
  const digest = await proposalDigest(body);
  const expires = Date.parse(body.expires_at);
  if (Number.isNaN(expires) || expires - Date.now() > 2 * 60 * 60 * 1000) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'proposal_ttl',
      'La propuesta caduca demasiado tarde. El máximo provisional es de 2 horas.',
    );
  }
  return { ...body, approval_digest: digest };
}

export async function proposalFingerprint(body: ProposalBody): Promise<string> {
  return createHash('sha256')
    .update(await proposalDigest(body))
    .digest('hex');
}

export function newId(): string {
  return randomUUID();
}

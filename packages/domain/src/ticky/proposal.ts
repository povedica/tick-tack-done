import { subtle, utf8 } from '../crypto/web';
import { canonicalJson } from './canonical-json';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TOOLS = ['tasks.update', 'tasks.complete', 'tasks.create', 'tasks.trash'] as const;
const REASONS = ['USER_REQUEST', 'DAILY_PLAN', 'CAPTURE'] as const;
const CHANGE_KEYS = ['title', 'due_at', 'completed', 'project_id', 'trashed'] as const;

export type TickyTool = (typeof TOOLS)[number];
export type TickyReason = (typeof REASONS)[number];

export interface TaskChanges {
  readonly title?: string | null;
  readonly due_at?: string | null;
  readonly completed?: boolean | null;
  readonly project_id?: string | null;
  readonly trashed?: boolean | null;
}

export interface ProposalItem {
  readonly action_id: string;
  readonly tool: TickyTool;
  readonly resource_id: string;
  readonly expected_version: number;
  readonly before: TaskChanges;
  readonly after: TaskChanges;
  readonly reason_code: TickyReason;
  readonly risk?: 'reversible_write';
}

export interface ProposalBody {
  readonly schema_version?: '1.0';
  readonly proposal_id: string;
  readonly owner_id: string;
  readonly run_id: string;
  readonly contract_version?: 'ticky-actions-v1';
  readonly expires_at: string;
  readonly timezone: string;
  readonly authority_version: number;
  readonly items: readonly ProposalItem[];
  readonly approval_digest?: string;
}

export class ProposalError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/** Matches Proposal.digest() in the Ticky service: exclude approval_digest, keep set fields only. */
export async function proposalDigest(body: ProposalBody): Promise<string> {
  const bytes = utf8(canonicalJson(normalizeProposal(body)));
  const digest = await subtle().digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function normalizeProposal(body: ProposalBody): Record<string, unknown> {
  validateShape(body);
  return {
    authority_version: body.authority_version,
    contract_version: 'ticky-actions-v1',
    expires_at: body.expires_at,
    items: body.items.map((item) => ({
      action_id: item.action_id,
      after: changesObject(item.after),
      before: changesObject(item.before),
      expected_version: item.expected_version,
      reason_code: item.reason_code,
      resource_id: item.resource_id,
      risk: 'reversible_write',
      tool: item.tool,
    })),
    owner_id: body.owner_id,
    proposal_id: body.proposal_id,
    run_id: body.run_id,
    schema_version: '1.0',
    timezone: body.timezone,
  };
}

export async function validateProposal(body: ProposalBody): Promise<void> {
  validateShape(body);
  if (body.approval_digest !== undefined && body.approval_digest.length > 0) {
    const expected = await proposalDigest(body);
    if (body.approval_digest !== expected) {
      throw new ProposalError('proposal_digest_invalid');
    }
  }
}

function validateShape(body: ProposalBody): void {
  if (!UUID.test(body.proposal_id) || !UUID.test(body.owner_id) || !UUID.test(body.run_id)) {
    throw new ProposalError('proposal_invalid');
  }
  if (!Number.isInteger(body.authority_version) || body.authority_version < 1) {
    throw new ProposalError('proposal_invalid');
  }
  if (body.timezone.trim().length === 0) {
    throw new ProposalError('proposal_invalid');
  }
  if (body.items.length < 1 || body.items.length > 20) {
    throw new ProposalError('proposal_invalid');
  }
  const seen = new Set<string>();
  for (const item of body.items) {
    if (!UUID.test(item.action_id) || !UUID.test(item.resource_id) || seen.has(item.action_id)) {
      throw new ProposalError('proposal_invalid');
    }
    seen.add(item.action_id);
    if (!TOOLS.includes(item.tool) || !REASONS.includes(item.reason_code)) {
      throw new ProposalError('proposal_invalid');
    }
    if (!Number.isInteger(item.expected_version) || item.expected_version < 0) {
      throw new ProposalError('invalid_version_precondition');
    }
    if ((item.tool === 'tasks.create') !== (item.expected_version === 0)) {
      throw new ProposalError('invalid_version_precondition');
    }
    assertChanges(item.before);
    assertChanges(item.after);
    if (item.tool === 'tasks.update' && Object.keys(changesObject(item.after)).length === 0) {
      throw new ProposalError('empty_update');
    }
    if (item.reason_code === 'DAILY_PLAN' && 'due_at' in item.after) {
      throw new ProposalError('deadline_reprogramming_forbidden');
    }
  }
}

export function actionBlocked(
  item: ProposalItem,
): 'side_effects_undescribed' | 'title_needs_edit' | null {
  if (item.tool === 'tasks.complete' || item.tool === 'tasks.trash') {
    return 'side_effects_undescribed';
  }
  if (
    item.after.title !== undefined &&
    item.after.title !== null &&
    titleNeedsEdit(item.after.title)
  ) {
    return 'title_needs_edit';
  }
  return null;
}

export async function approvalMatches(
  body: ProposalBody,
  approval: {
    readonly owner_id: string;
    readonly proposal_id: string;
    readonly digest: string;
    readonly selected_actions: readonly string[];
    readonly approved_at: string;
  },
  ownerId: string,
  nowIso: string,
): Promise<void> {
  const now = Date.parse(nowIso);
  const expires = Date.parse(body.expires_at);
  const approved = Date.parse(approval.approved_at);
  if (ownerId !== body.owner_id || approval.owner_id !== ownerId) {
    throw new ProposalError('owner_mismatch');
  }
  if (
    approval.proposal_id !== body.proposal_id ||
    approval.digest !== (await proposalDigest(body))
  ) {
    throw new ProposalError('approval_invalid');
  }
  if (Number.isNaN(now) || Number.isNaN(expires) || Number.isNaN(approved)) {
    throw new ProposalError('approval_expired');
  }
  if (now >= expires || approved > now || approved >= expires) {
    throw new ProposalError('approval_expired');
  }
  const ids = new Set(body.items.map((item) => item.action_id));
  const selected = new Set(approval.selected_actions);
  if (
    selected.size !== approval.selected_actions.length ||
    approval.selected_actions.length === 0
  ) {
    throw new ProposalError('invalid_selection');
  }
  for (const id of approval.selected_actions) {
    if (!ids.has(id)) {
      throw new ProposalError('invalid_selection');
    }
  }
}

export const APP_TITLE_MAX = 500;

export function titleNeedsEdit(title: string): boolean {
  return title.length > APP_TITLE_MAX;
}

function assertChanges(changes: TaskChanges): void {
  for (const key of Object.keys(changes)) {
    if (!CHANGE_KEYS.includes(key as (typeof CHANGE_KEYS)[number])) {
      throw new ProposalError('proposal_invalid');
    }
  }
  if ('title' in changes && changes.title === null) {
    throw new ProposalError('field_cannot_be_cleared');
  }
  if ('completed' in changes && changes.completed === null) {
    throw new ProposalError('field_cannot_be_cleared');
  }
  if ('project_id' in changes && changes.project_id === null) {
    throw new ProposalError('field_cannot_be_cleared');
  }
  if ('trashed' in changes && changes.trashed === null) {
    throw new ProposalError('field_cannot_be_cleared');
  }
  if (changes.title !== undefined && changes.title.length < 1) {
    throw new ProposalError('proposal_invalid');
  }
  if (changes.project_id !== undefined && !UUID.test(changes.project_id)) {
    throw new ProposalError('proposal_invalid');
  }
}

function changesObject(changes: TaskChanges): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if ('title' in changes) {
    out.title = changes.title;
  }
  if ('due_at' in changes) {
    out.due_at = changes.due_at;
  }
  if ('completed' in changes) {
    out.completed = changes.completed;
  }
  if ('project_id' in changes) {
    out.project_id = changes.project_id;
  }
  if ('trashed' in changes) {
    out.trashed = changes.trashed;
  }
  return out;
}

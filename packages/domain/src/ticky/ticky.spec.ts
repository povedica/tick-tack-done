import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { canonicalJson } from './canonical-json';
import { buildContextSnapshot } from './context-snapshot';
import { occupiedIntervals } from './free-busy';
import { proposalDigest, validateProposal, type ProposalBody } from './proposal';
import { projectConstraint, readCapabilities } from './read-policy';

const cafe: ProposalBody = {
  proposal_id: '11111111-1111-4111-8111-111111111111',
  owner_id: '22222222-2222-4222-8222-222222222222',
  run_id: '33333333-3333-4333-8333-333333333333',
  expires_at: '2026-10-20T12:00:00Z',
  timezone: 'Europe/Madrid',
  authority_version: 1,
  items: [
    {
      action_id: '44444444-4444-4444-8444-444444444444',
      tool: 'tasks.create',
      resource_id: '55555555-5555-4555-8555-555555555555',
      expected_version: 0,
      before: {},
      after: { title: 'Café ☕️', due_at: '2026-10-21T09:00:00Z' },
      reason_code: 'USER_REQUEST',
    },
  ],
};

const subset: ProposalBody = {
  proposal_id: '11111111-1111-4111-8111-111111111111',
  owner_id: '22222222-2222-4222-8222-222222222222',
  run_id: '33333333-3333-4333-8333-333333333333',
  expires_at: '2026-10-20T12:00:00Z',
  timezone: 'Europe/Madrid',
  authority_version: 2,
  items: [
    {
      action_id: '44444444-4444-4444-8444-444444444444',
      tool: 'tasks.update',
      resource_id: '55555555-5555-4555-8555-555555555555',
      expected_version: 3,
      before: { title: 'a' },
      after: { due_at: null, title: 'b' },
      reason_code: 'USER_REQUEST',
    },
    {
      action_id: '66666666-6666-4666-8666-666666666666',
      tool: 'tasks.trash',
      resource_id: '77777777-7777-4777-8777-777777777777',
      expected_version: 1,
      before: { trashed: false },
      after: { trashed: true },
      reason_code: 'CAPTURE',
    },
  ],
};

describe('ticky contracts', () => {
  it('TK-310: digest matches the Python Proposal.digest vectors', async () => {
    expect(await proposalDigest(cafe)).toBe(
      'ef52b43740d9fae952de274cfe679d2e5956d88d0b8337bdd3b9a35cf0c40153',
    );
    expect(await proposalDigest(subset)).toBe(
      '8d523e6a4d3c7f67b8fb0fc6a513b0c40b11d7d886023868388ff4c860f33c13',
    );
  });

  it('TK-310: omitted due_at differs from explicit null', async () => {
    const cleared = await proposalDigest(subset);
    const omitted = await proposalDigest({
      ...subset,
      items: subset.items.map((item, index) =>
        index === 0 ? { ...item, after: { title: 'b' } } : item,
      ),
    });
    expect(omitted).not.toBe(cleared);
  });

  it('canonical JSON keeps emoji and rejects NaN', () => {
    expect(canonicalJson({ b: 1, a: 'á' })).toBe('{"a":"á","b":1}');
    expect(() => canonicalJson(Number.NaN)).toThrow('canonical_json_nan');
    expect(createHash('sha256').update(canonicalJson({ a: 1 })).digest('hex')).toHaveLength(64);
  });

  it('RF-2002: a daily plan must not rewrite a deadline', async () => {
    await expect(
      validateProposal({
        ...cafe,
        items: [{ ...cafe.items[0]!, tool: 'tasks.update', expected_version: 1, reason_code: 'DAILY_PLAN' }],
      }),
    ).rejects.toThrow('deadline_reprogramming_forbidden');
  });

  it('APP-01: restricted lists cannot be widened by omitting project_id', () => {
    expect(projectConstraint(['list-a'], 'list-b')).toEqual({
      id: '00000000-0000-0000-0000-000000000000',
    });
    expect(projectConstraint(['list-a'])).toEqual({ projectId: { in: ['list-a'] } });
    expect(readCapabilities({ ownerId: 'o', listIds: ['a'], scopes: ['tasks:read', 'tasks:write'] }).scopes).toEqual([
      'tasks:read',
    ]);
  });

  it('APP-05: a stale calendar is unknown, not free', () => {
    expect(
      occupiedIntervals({
        subscriptions: [{ lastSyncedAt: null, lastError: 'down', visible: true }],
        events: [],
        nowIso: '2026-10-20T10:00:00Z',
        freshWithinMs: 60_000,
      }),
    ).toBeNull();
    const snapshot = buildContextSnapshot({
      authorityVersion: 1,
      sourceRevision: 1,
      issuedAt: '2026-10-20T10:00:00Z',
      timeZone: 'Europe/Madrid',
      workday: null,
      calendar: null,
      review: null,
      taskEnergy: [],
      durationObservations: [
        {
          observation_id: '1',
          task_id: '2',
          list_id: '3',
          source: 'task_duration',
          source_version: 1,
          minutes: 0,
          observed_at: '2026-10-20T09:00:00Z',
        },
      ],
    });
    expect(snapshot.calendar).toBeNull();
    expect(snapshot.workday).toBeNull();
    expect(snapshot.duration_observations).toEqual([]);
    expect(Date.parse(snapshot.expires_at) - Date.parse(snapshot.issued_at)).toBe(15 * 60 * 1000);
  });
});

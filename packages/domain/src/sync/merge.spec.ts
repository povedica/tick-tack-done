import { describe, expect, it } from 'vitest';
import { mergeFieldClocks } from './merge';

const T0 = '2026-10-18T08:00:00.000Z';
const T1 = '2026-10-18T09:00:00.000Z';
const T2 = '2026-10-18T10:00:00.000Z';

describe('mergeFieldClocks', () => {
  it('RF-13012: a later title clock wins and an older one is a conflict', () => {
    const first = mergeFieldClocks({
      clocks: {},
      fields: ['title'],
      patchClocks: { title: T1 },
      receivedAt: T1,
      operation: 'update',
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }
    const second = mergeFieldClocks({
      clocks: first.clocks,
      fields: ['title'],
      patchClocks: { title: T0 },
      receivedAt: T2,
      operation: 'update',
    });
    expect(second).toMatchObject({ ok: true, apply: [], skipped: ['title'], conflict: true });
  });

  it('RF-13012: complete that arrives later wins over an older text edit', () => {
    const edited = mergeFieldClocks({
      clocks: {},
      fields: ['title'],
      patchClocks: { title: T1 },
      receivedAt: T1,
      operation: 'update',
    });
    if (!edited.ok) {
      throw new Error('edit');
    }
    const completed = mergeFieldClocks({
      clocks: edited.clocks,
      fields: ['status', 'completed_at'],
      patchClocks: {},
      receivedAt: T2,
      operation: 'complete',
    });
    expect(completed.ok).toBe(true);
    if (!completed.ok) {
      return;
    }
    expect(completed.apply).toEqual(['status', 'completed_at']);
    const lateText = mergeFieldClocks({
      clocks: completed.clocks,
      fields: ['title'],
      patchClocks: { title: T0 },
      receivedAt: T2,
      operation: 'update',
    });
    expect(lateText).toMatchObject({ ok: true, skipped: ['title'], conflict: true });
  });

  it('RF-13012: a text edit newer than the completion still applies to that field', () => {
    const completed = mergeFieldClocks({
      clocks: { title: T0 },
      fields: ['status'],
      patchClocks: {},
      receivedAt: T1,
      operation: 'complete',
    });
    if (!completed.ok) {
      throw new Error('complete');
    }
    const edited = mergeFieldClocks({
      clocks: completed.clocks,
      fields: ['title'],
      patchClocks: { title: T2 },
      receivedAt: T2,
      operation: 'update',
    });
    expect(edited).toMatchObject({ ok: true, apply: ['title'], conflict: false });
  });

  it('rejects a clock that is not a timestamp', () => {
    expect(
      mergeFieldClocks({
        clocks: {},
        fields: ['title'],
        patchClocks: { title: 'ayer' },
        receivedAt: T1,
        operation: 'update',
      }),
    ).toEqual({ ok: false, reason: 'invalid_clock' });
  });
});

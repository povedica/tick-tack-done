import { describe, expect, it } from 'vitest';
import { pushUndo, requestUndo, settleComplete, type CompleteJob } from './completion';

describe('today completion', () => {
  it('UI-404: undo while the request is in flight waits, then reverts', async () => {
    const job: CompleteJob = { phase: 'inflight' };
    expect(requestUndo(job)).toBe('defer');
    const calls: string[] = [];
    await expect(
      settleComplete(job, () => {
        calls.push('uncomplete');
        return Promise.resolve();
      }),
    ).resolves.toBe('reverted');
    expect(calls).toEqual(['uncomplete']);
  });

  it('UI-404: undo after success asks to uncomplete immediately', () => {
    const job: CompleteJob = { phase: 'done' };
    expect(requestUndo(job)).toBe('now');
    expect(requestUndo(job)).toBe('defer');
  });

  it('keeps at most three undo toasts, newest last', () => {
    const third = pushUndo(
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
      ],
      { id: 'c', title: 'C' },
    );
    expect(pushUndo(third, { id: 'd', title: 'D' }).map((item) => item.id)).toEqual([
      'b',
      'c',
      'd',
    ]);
  });
});

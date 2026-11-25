import { EventEmitter } from 'node:events';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { leaks, TRAP } from '../../test/helpers/pii-trap.js';
import { isolated } from './background-failure.js';
import { watchQueue } from './queue-failures.js';

afterEach(() => {
  vi.restoreAllMocks();
});

function logged(spy: ReturnType<typeof vi.spyOn>): string {
  return JSON.stringify(spy.mock.calls);
}

describe('queue failures', () => {
  it('CA-07: a failed job logs queue, job name, id and attempts, never its data', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const worker = new EventEmitter();
    watchQueue('domain-events', null, worker);
    worker.emit(
      'failed',
      { name: 'task.created@v1', id: 'job-1', attemptsMade: 2, data: { title: TRAP.title } },
      new Error(`router failed for ${TRAP.email}`),
    );
    expect(error).toHaveBeenCalledTimes(1);
    const line = JSON.parse(String(error.mock.calls[0]?.[0])) as Record<string, unknown>;
    expect(line).toMatchObject({
      event: 'background_failure',
      component: 'worker',
      queue: 'domain-events',
      job: 'task.created@v1',
      job_id: 'job-1',
      attempts: 2,
    });
    expect(String(error.mock.calls[0]?.[1])).toMatch(/^Error: router failed for \[email\]/);
    expect(leaks(logged(error))).toEqual([]);
  });

  it('an error event on the queue or the worker is logged scrubbed and does not throw', () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const queue = new EventEmitter();
    const worker = new EventEmitter();
    watchQueue('calendar-local-days', queue, worker);
    expect(() => queue.emit('error', new Error(`redis down ${TRAP.pat}`))).not.toThrow();
    expect(() => worker.emit('error', new Error('lock lost'))).not.toThrow();
    expect(error).toHaveBeenCalledTimes(2);
    expect(leaks(logged(error))).toEqual([]);
  });

  it('isolated returns the fallback and reports once', async () => {
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const result = await isolated({ queue: 'scheduler', job: 'reminders' }, 7, () =>
      Promise.reject(new Error('boom')),
    );
    expect(result).toBe(7);
    expect(error).toHaveBeenCalledTimes(1);
  });
});

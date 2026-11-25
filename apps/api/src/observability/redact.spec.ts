import { describe, expect, it } from 'vitest';
import { leaks, TRAP } from '../../test/helpers/pii-trap.js';
import {
  describeError,
  maskTokenPaths,
  MAX_MESSAGE_LENGTH,
  safePath,
  safeStack,
  scrubText,
} from './redact.js';

class PrismaClientKnownRequestError extends Error {
  override name = 'PrismaClientKnownRequestError';
  constructor(
    message: string,
    readonly code: string,
    readonly meta: Record<string, unknown>,
  ) {
    super(message);
  }
}

describe('redact', () => {
  it('RF-2001: masks /feeds/:token and /public/lists/:token', () => {
    expect(maskTokenPaths(`/feeds/${TRAP.feedToken}.ics`)).toBe('/feeds/:token');
    expect(maskTokenPaths(`/api/v1/public/lists/${TRAP.publicListToken}`)).toBe(
      '/api/v1/public/lists/:token',
    );
    expect(safePath(`/api/v1/public/lists/${TRAP.publicListToken}?${TRAP.query}`)).toBe(
      '/api/v1/public/lists/:token',
    );
  });

  it('CA-05: scrubs emails, rfx tokens, Bearer, the session cookie, ids and token paths', () => {
    const text = [
      `user ${TRAP.email}`,
      `Authorization: Bearer ${TRAP.pat}`,
      `refresh ${TRAP.oauthRefresh}`,
      `cookie ${TRAP.session}`,
      `GET /feeds/${TRAP.feedToken}`,
      'task 11111111-1111-4111-8111-111111111111',
    ].join(' | ');
    const scrubbed = scrubText(text, 1_000);
    expect(leaks(scrubbed)).toEqual([]);
    expect(scrubbed).toContain('[email]');
    expect(scrubbed).toContain('Bearer [token]');
    expect(scrubbed).toContain('/feeds/:token');
    expect(scrubbed).toContain('task :id');
  });

  it('truncates to 300 characters', () => {
    expect(scrubText('x'.repeat(1_000))).toHaveLength(MAX_MESSAGE_LENGTH);
  });

  it('CA-05: a Prisma error keeps only code and model.operation, never the interpolated title', () => {
    const error = new PrismaClientKnownRequestError(
      `Invalid \`prisma.task.create()\` invocation:\n  title: "${TRAP.title}"`,
      'P2002',
      { modelName: 'Task', target: [TRAP.title] },
    );
    expect(describeError(error)).toEqual({
      name: 'PrismaClientKnownRequestError',
      message: 'PrismaError P2002 Task.create',
    });
    expect(leaks(safeStack(error))).toEqual([]);
  });

  it('the stack keeps frames and replaces the raw message with the scrubbed one', () => {
    const error = new Error(`failed for ${TRAP.email} with ${TRAP.pat}`);
    const stack = safeStack(error);
    expect(stack.split('\n')[0]).toBe('Error: failed for [email] with [token]');
    expect(stack).toMatch(/\n {4}at /);
    expect(leaks(stack)).toEqual([]);
  });

  it('non-Error values never serialize objects', () => {
    expect(describeError({ title: TRAP.title })).toEqual({ name: 'NonError', message: 'Unknown' });
  });
});

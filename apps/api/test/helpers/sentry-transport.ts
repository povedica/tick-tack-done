import { createTransport } from '@sentry/core';
import type { Transport } from '@sentry/core';
import type { NodeOptions } from '@sentry/nestjs';

export interface CapturedEnvelopes {
  readonly raw: string[];
  /** Event and message payloads, parsed. */
  events(): Record<string, unknown>[];
}

/** A transport that keeps every envelope in memory. `fail` makes every send reject. */
export function fakeTransport(fail = false): {
  transport: NonNullable<NodeOptions['transport']>;
  captured: CapturedEnvelopes;
} {
  const raw: string[] = [];
  const transport: NonNullable<NodeOptions['transport']> = (options): Transport =>
    createTransport(options, (request) => {
      raw.push(
        typeof request.body === 'string' ? request.body : new TextDecoder().decode(request.body),
      );
      return fail
        ? Promise.reject(new Error('sentry unreachable'))
        : Promise.resolve({ statusCode: 200 });
    });
  return {
    transport,
    captured: {
      raw,
      events: () => raw.flatMap(eventsOf),
    },
  };
}

function eventsOf(envelope: string): Record<string, unknown>[] {
  const lines = envelope.split('\n').filter((line) => line.length > 0);
  const out: Record<string, unknown>[] = [];
  for (let index = 1; index < lines.length - 1; index += 2) {
    const header = JSON.parse(lines[index] ?? '{}') as { type?: string };
    if (header.type === 'event') {
      out.push(JSON.parse(lines[index + 1] ?? '{}') as Record<string, unknown>);
    }
  }
  return out;
}

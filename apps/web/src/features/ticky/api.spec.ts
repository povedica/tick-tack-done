import { afterEach, describe, expect, it, vi } from 'vitest';
import { tickyApi, type TickyApiError, waitForTickyRun } from './api';
import { useLocale } from '../../i18n/locale';

function frame(id: string, type: string, run: string, payload: unknown): string {
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify({ run_id: run, type, payload })}\n\n`;
}
afterEach(() => {
  vi.unstubAllGlobals();
  useLocale.setState({ choice: 'es' });
});

describe('APP-03 / TK-610: SSE client', () => {
  it('TTD-AUD-27: localizes transport errors while preserving status and code', async () => {
    useLocale.setState({ choice: 'en' });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: 'La rutina cambió',
            code: 'routine_version_conflict',
          }),
          { status: 409 },
        ),
      ),
    );
    await expect(tickyApi.routines()).rejects.toMatchObject({
      status: 409,
      code: 'routine_version_conflict',
      message: 'The state changed in another session. Review the data before trying again.',
    } satisfies Partial<TickyApiError>);
  });

  it('TTD-AUD-27: localizes stream errors using the current locale', async () => {
    useLocale.setState({ choice: 'en' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 409 })));
    await expect(waitForTickyRun('mine', new AbortController().signal)).rejects.toThrow(
      'History changed. Check it before repeating the message.',
    );
  });
  it('reconnects with the last event cursor and returns the canonical result without posting again', async () => {
    const run = 'synthetic-run';
    const result = { text: 'Respuesta sintética', llm_calls: 0 };
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response(frame('one', 'run.accepted', run, {})))
      .mockResolvedValueOnce(new Response(frame('two', 'run.completed', run, result)));
    vi.stubGlobal('fetch', fetcher);
    expect(await waitForTickyRun(run, new AbortController().signal)).toEqual(result);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toContain('cursor=one');
    expect(fetcher.mock.calls.every((call) => (call[1] as RequestInit).method === undefined)).toBe(
      true,
    );
  });

  it('rejects a result from a different run', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(frame('one', 'run.completed', 'other', {}))),
    );
    await expect(waitForTickyRun('mine', new AbortController().signal)).rejects.toThrow(
      'no válida',
    );
  });

  it('does not retry admission or the stream when its cursor is no longer retained', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}', { status: 409 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(waitForTickyRun('mine', new AbortController().signal)).rejects.toThrow(
      'historial',
    );
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it('fails boundedly on oversized events', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('x'.repeat(1_000_001))));
    await expect(waitForTickyRun('mine', new AbortController().signal)).rejects.toThrow(
      'demasiado grande',
    );
  });
});

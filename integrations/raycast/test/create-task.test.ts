import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { CREATE_TASK_TIMEOUT_MS, createTask } from '../src/create-task.ts';

const TOKEN = 'pat-test-value-not-a-secret-file';
const TEXT = 'Prueba #tag1 !alta hoy ^casa';

function input(overrides: Partial<Parameters<typeof createTask>[0]> = {}) {
  return {
    baseUrl: 'https://todo.reflexionia.com',
    token: TOKEN,
    rawText: TEXT,
    idempotencyKey: '11111111-1111-4111-8111-111111111111',
    fetchImpl: fetch,
    ...overrides,
  };
}

test('CA-06: an empty field does not call the API', async () => {
  let calls = 0;
  const result = await createTask(
    input({
      rawText: '   ',
      fetchImpl: () => {
        calls += 1;
        return Promise.reject(new Error('should not run'));
      },
    }),
  );
  assert.deepEqual(result, { ok: false, kind: 'validation' });
  assert.equal(calls, 0);
});

test('sends raw_text unchanged, with bearer auth and one idempotency key', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  const result = await createTask(
    input({
      baseUrl: 'https://todo.reflexionia.com/',
      fetchImpl: (url, init) => {
        seen = { url: String(url), init: init ?? {} };
        return Promise.resolve(new Response('{}', { status: 201 }));
      },
    }),
  );
  assert.deepEqual(result, { ok: true });
  assert.ok(seen);
  assert.equal(seen.url, 'https://todo.reflexionia.com/api/v1/tasks');
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.body, JSON.stringify({ raw_text: TEXT }));
  const headers = new Headers(seen.init.headers);
  assert.equal(headers.get('authorization'), `Bearer ${TOKEN}`);
  assert.equal(headers.get('content-type'), 'application/json');
  assert.equal(headers.get('idempotency-key'), '11111111-1111-4111-8111-111111111111');
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('treats 200 the same as 201', async () => {
  const result = await createTask(
    input({
      fetchImpl: () => Promise.resolve(new Response(null, { status: 200 })),
    }),
  );
  assert.deepEqual(result, { ok: true });
});

test('CA-03: a 401 exposes the API code and message, never the token', async () => {
  const result = await createTask(
    input({
      fetchImpl: () =>
        Promise.resolve(
          Response.json(
            { error: { code: 'unauthorized', message: `invalid ${TOKEN}` } },
            { status: 401 },
          ),
        ),
    }),
  );
  assert.equal(result.ok, false);
  if (result.ok || result.kind !== 'api') {
    assert.fail('expected an API error');
  }
  assert.equal(result.status, 401);
  assert.equal(result.code, 'unauthorized');
  assert.equal(result.message, 'invalid …');
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test('CA-04: a network failure is offline and does not echo the token', async () => {
  const result = await createTask(
    input({
      fetchImpl: () => Promise.reject(new Error(`connect ${TOKEN}`)),
    }),
  );
  assert.deepEqual(result, { ok: false, kind: 'offline' });
});

test('CA-04: a request that exceeds the timeout is offline', async () => {
  const result = await createTask(
    input({
      timeoutMs: 30,
      fetchImpl: (_url, init) =>
        new Promise((_resolve, reject) => {
          const timer = setTimeout(() => {
            reject(new Error('timed out without abort'));
          }, 500);
          const abort = () => {
            clearTimeout(timer);
            reject(init?.signal?.reason ?? new Error('aborted'));
          };
          if (init?.signal?.aborted) {
            abort();
            return;
          }
          init?.signal?.addEventListener('abort', abort, { once: true });
        }),
    }),
  );
  assert.deepEqual(result, { ok: false, kind: 'offline' });
});

test('the default timeout is 10 seconds', async () => {
  const seen: number[] = [];
  const original = AbortSignal.timeout.bind(AbortSignal);
  mock.method(AbortSignal, 'timeout', (ms: number) => {
    seen.push(ms);
    return original(60_000);
  });
  try {
    await createTask(
      input({
        fetchImpl: () => Promise.resolve(new Response(null, { status: 201 })),
      }),
    );
  } finally {
    mock.restoreAll();
  }
  assert.equal(CREATE_TASK_TIMEOUT_MS, 10_000);
  assert.deepEqual(seen, [10_000]);
});

test('a missing token does not call the API', async () => {
  let calls = 0;
  const result = await createTask(
    input({
      token: '  ',
      fetchImpl: () => {
        calls += 1;
        return Promise.reject(new Error('should not run'));
      },
    }),
  );
  assert.deepEqual(result, { ok: false, kind: 'config', message: 'Falta el token' });
  assert.equal(calls, 0);
});

import { describe, expect, it } from 'vitest';
import { createApiClient, SDK_SOURCE, type ApiError } from './index';

function requestUrl(url: Parameters<typeof fetch>[0]): string {
  if (typeof url === 'string') {
    return url;
  }
  if (url instanceof URL) {
    return url.href;
  }
  return url.url;
}

describe('sdk', () => {
  it('RF-2002: forwards the activity cursor and limit', async () => {
    const urls: string[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: (url) => {
        urls.push(requestUrl(url));
        return Promise.resolve(new Response(JSON.stringify({ items: [], next_cursor: null })));
      },
    });
    await client.tokenActivity('token-1', { cursor: 'older/page', limit: 20 });
    const url = new URL(urls[0] ?? 'http://invalid');
    expect(url.pathname).toBe('/api/v1/me/tokens/token-1/activity');
    expect(url.searchParams.get('cursor')).toBe('older/page');
    expect(url.searchParams.get('limit')).toBe('20');
  });
  it('keeps the client sourced from OpenAPI', () => {
    expect(SDK_SOURCE).toBe('openapi');
  });

  it('RF-102: posts raw_text to the public create endpoint', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      devUserEmail: 'demo@reflexionia.test',
      fetchImpl: (url, init) => {
        requests.push({ url: requestUrl(url), init });
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'task-1', title: 'comprar leche' }), { status: 201 }),
        );
      },
    });

    const created = await client.createTask({ raw_text: 'comprar leche !alta' }, 'key-1');

    expect(created.title).toBe('comprar leche');
    expect(requests[0]?.url).toBe('http://api.test/api/v1/tasks');
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers['X-Dev-User-Email']).toBe('demo@reflexionia.test');
    expect(headers['Idempotency-Key']).toBe('key-1');
    expect(requests[0]?.init?.body).toBe(JSON.stringify({ raw_text: 'comprar leche !alta' }));
  });

  it('RF-107: surfaces an empty title as an API error', async () => {
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ error: { code: 'empty_title', message: 'title is required' } }),
            { status: 400 },
          ),
        ),
    });

    await expect(client.createTask({ raw_text: '   ' }, 'key-2')).rejects.toMatchObject({
      status: 400,
      code: 'empty_title',
    } satisfies Partial<ApiError>);
  });

  it('RF-603: lists overdue tasks from the public collection', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      devUserEmail: 'demo@reflexionia.test',
      fetchImpl: (url, init) => {
        requests.push({ url: requestUrl(url), init });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{ id: 'task-1', title: 'Informe', status: 'active' }],
              next_cursor: null,
            }),
            { status: 200 },
          ),
        );
      },
    });

    const page = await client.listTasks({ overdue: true, status: 'active' });

    expect(page.items[0]?.title).toBe('Informe');
    expect(requests[0]?.url).toBe('http://api.test/api/v1/tasks?status=active&overdue=true');
    expect(requests[0]?.init?.method).toBe('GET');
  });

  it('RF-206: completes a task with an idempotency key', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: (url, init) => {
        requests.push({ url: requestUrl(url), init });
        return Promise.resolve(
          new Response(JSON.stringify({ id: 'task-1', title: 'Informe', status: 'completed' }), {
            status: 200,
          }),
        );
      },
    });

    const task = await client.completeTask('task-1', {}, 'key-3');

    expect(task.status).toBe('completed');
    expect(requests[0]?.url).toBe('http://api.test/api/v1/tasks/task-1/complete');
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe('key-3');
  });

  it('RF-1301: lists habits from the public collection', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      devUserEmail: 'demo@reflexionia.test',
      fetchImpl: (url, init) => {
        requests.push({ url: requestUrl(url), init });
        return Promise.resolve(
          new Response(JSON.stringify({ items: [], next_cursor: null }), { status: 200 }),
        );
      },
    });

    const page = await client.listHabits();

    expect(page.items).toEqual([]);
    expect(requests[0]?.url).toBe('http://api.test/api/v1/habits');
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers['X-Dev-User-Email']).toBe('demo@reflexionia.test');
  });

  it('RF-1501: searches through the public endpoint', async () => {
    const requests: { url: string }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      fetchImpl: (url) => {
        requests.push({ url: requestUrl(url) });
        return Promise.resolve(
          new Response(JSON.stringify({ text: 'leer', groups: [] }), { status: 200 }),
        );
      },
    });

    const result = await client.search('leer #casa', 'task,note');

    expect(result.text).toBe('leer');
    expect(requests[0]?.url).toBe('http://api.test/api/v1/search?q=leer+%23casa&types=task%2Cnote');
  });

  it('RF-2002: creates a token on the public route and lists it without the secret', async () => {
    const requests: { url: string; method: string | undefined }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      devUserEmail: 'demo@reflexionia.test',
      fetchImpl: (url, init) => {
        requests.push({ url: requestUrl(url), method: init?.method });
        if (init?.method === 'POST') {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                id: 'tok-1',
                name: 'Cursor',
                token: 'rfx_pat_secret',
                token_prefix: 'rfx_pat_secre',
                scopes: ['tasks:read'],
                created_at: '2026-10-18T00:00:00.000Z',
                last_used_at: null,
                revoked_at: null,
              }),
              { status: 201 },
            ),
          );
        }
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [
                {
                  id: 'tok-1',
                  name: 'Cursor',
                  token_prefix: 'rfx_pat_secre',
                  scopes: ['tasks:read'],
                  created_at: '2026-10-18T00:00:00.000Z',
                  last_used_at: null,
                  revoked_at: null,
                },
              ],
              next_cursor: null,
            }),
            { status: 200 },
          ),
        );
      },
    });

    const created = await client.createToken({ name: 'Cursor', scopes: ['tasks:read'] });
    const listed = await client.listTokens();
    await client.listTokens({ limit: 10, cursor: 'next', status: 'revoked' });

    expect(created.token).toBe('rfx_pat_secret');
    expect(listed.items[0]?.name).toBe('Cursor');
    expect(requests.map((item) => `${item.method ?? ''} ${item.url}`)).toEqual([
      'POST http://api.test/api/v1/me/tokens',
      'GET http://api.test/api/v1/me/tokens',
      'GET http://api.test/api/v1/me/tokens?limit=10&cursor=next&status=revoked',
    ]);
  });

  it('reads the current session and sends the cookie and CSRF token', async () => {
    const requests: { url: string; init: RequestInit | undefined }[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      credentials: 'include',
      csrfToken: () => 'csrf-1',
      fetchImpl: (url, init) => {
        requests.push({ url: requestUrl(url), init });
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: 'user-1',
              email: 'ada@example.com',
              display_name: 'Ada',
              csrf_token: 'csrf-1',
            }),
            { status: 200 },
          ),
        );
      },
    });

    const session = await client.currentSession();

    expect(session.email).toBe('ada@example.com');
    expect(requests[0]?.url).toBe('http://api.test/api/v1/auth/session');
    expect(requests[0]?.init?.credentials).toBe('include');
    const headers = requests[0]?.init?.headers as Record<string, string>;
    expect(headers['X-CSRF-Token']).toBe('csrf-1');
    expect(headers['X-Dev-User-Email']).toBeUndefined();
  });
});

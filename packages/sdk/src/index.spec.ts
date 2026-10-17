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
});

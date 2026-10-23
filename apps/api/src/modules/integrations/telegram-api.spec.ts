import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TelegramApi } from './telegram-api.js';

const config = (id: string) => ({
  token: `${id}:${randomBytes(24).toString('base64url')}`,
  secret: '',
  botId: id,
  username: `bot_${id}`,
});
afterEach(() => vi.unstubAllGlobals());
describe('RF-2003: Telegram credentials', () => {
  it('keeps streamed Drive attachments bound to the selected bot and classifies blocked replies', async () => {
    const a = config('stream');
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve(
        url.includes('/file/')
          ? new Response('image')
          : url.endsWith('/sendMessage')
            ? new Response('{}', { status: 403 })
            : Response.json({ ok: true, result: { file_path: 'photos/test.jpg' } }),
      );
    });
    const api = new TelegramApi({} as never).withConfiguration(a);
    const stream = await api.downloadStream('file-a', 'owner-a');
    const chunks: Uint8Array[] = [];
    for await (const chunk of stream.source) chunks.push(chunk);
    expect(Buffer.concat(chunks).toString()).toBe('image');
    expect(urls).toContain(`https://api.telegram.org/file/bot${a.token}/photos/test.jpg`);
    await expect(api.call('sendMessage', {}, 'owner-a')).rejects.toMatchObject({
      response: { code: 'telegram_blocked' },
    });
  });
  it('keeps concurrent replies and file downloads bound to immutable bot credentials', async () => {
    const urls: string[] = [];
    vi.stubGlobal('fetch', (url: string) => {
      urls.push(url);
      return Promise.resolve(
        url.includes('/file/')
          ? new Response('image')
          : Response.json({ ok: true, result: { file_path: 'photos/test.jpg' } }),
      );
    });
    const api = new TelegramApi({} as never);
    const a = config('1');
    const b = config('2');
    await Promise.all([
      api.withConfiguration(a).download('file-a', 'owner-a'),
      api.withConfiguration(b).download('file-b', 'owner-b'),
    ]);
    expect(urls).toEqual(
      expect.arrayContaining([
        `https://api.telegram.org/bot${a.token}/getFile`,
        `https://api.telegram.org/file/bot${a.token}/photos/test.jpg`,
        `https://api.telegram.org/bot${b.token}/getFile`,
        `https://api.telegram.org/file/bot${b.token}/photos/test.jpg`,
      ]),
    );
  });
  it('sanitizes network errors containing Telegram credential URLs', async () => {
    const a = config('1');
    vi.stubGlobal('fetch', () => {
      throw new Error(`https://api.telegram.org/bot${a.token}/sendMessage`);
    });
    const api = new TelegramApi({} as never).withConfiguration(a);
    await expect(api.call('sendMessage', {})).rejects.toThrow('No se pudo contactar con Telegram.');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { DriveClient, DRIVE_STREAM_CHUNK_BYTES } from './drive-client.js';
afterEach(() => vi.unstubAllGlobals());
describe('TTD-AUD-99 Drive streaming transport', () => {
  it('initiates a resumable session with origin and metadata, never exposes a token', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(
        new Response(null, {
          status: 200,
          headers: { Location: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test' },
        }),
      );
    const client = new DriveClient('private-access', fetcher);
    const result = await client.session(
      {
        name: 'test.txt',
        mimeType: 'text/plain',
        size: 4,
        parent: 'folder',
        uploadId: 'signed-id',
      },
      'https://todo.reflexionia.com',
    );
    expect(result).toBe('https://www.googleapis.com/upload/drive/v3/files?upload_id=test');
    expect(fetcher).toHaveBeenCalledWith(
      expect.stringContaining('uploadType=resumable'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Origin: 'https://todo.reflexionia.com',
          'X-Upload-Content-Length': '4',
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('private-access');
  });
  it('sends bounded resumable chunks and a final content range without touching files', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 308,
          headers: { Range: `bytes=0-${DRIVE_STREAM_CHUNK_BYTES - 1}` },
        }),
      )
      .mockResolvedValueOnce(Response.json({ id: 'file' }));
    const client = new DriveClient('private-access', fetcher);
    async function* source() {
      for (let i = 0; i < 32; i++) yield await Promise.resolve(new Uint8Array(256 * 1024));
    }
    expect(
      await client.upload(
        'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',
        source(),
        25 * 1024 * 1024,
      ),
    ).toMatchObject({ id: 'file' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [, init] of fetcher.mock.calls as [string, RequestInit][])
      expect((init.body as Uint8Array).byteLength).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
      'Content-Range': `bytes ${DRIVE_STREAM_CHUNK_BYTES}-${8 * 1024 * 1024 - 1}/${8 * 1024 * 1024}`,
    });
  });
  it('maps Drive quota to 507 and rejects an untrusted session location', async () => {
    const quota = new DriveClient(
      'token',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { errors: [{ reason: 'storageQuotaExceeded' }] } },
            { status: 403 },
          ),
        ),
    );
    await expect(quota.file('id')).rejects.toMatchObject({ status: 507 });
    const bad = new DriveClient(
      'token',
      vi
        .fn()
        .mockResolvedValue(
          new Response(null, { headers: { Location: 'http://127.0.0.1/private' } }),
        ),
    );
    await expect(
      bad.session(
        { name: 'x', mimeType: 'text/plain', parent: 'folder', uploadId: 'id' },
        'https://todo.reflexionia.com',
      ),
    ).rejects.toMatchObject({ status: 502 });
  });
});

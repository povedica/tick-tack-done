import { afterEach, expect, it, vi } from 'vitest';
import { uploadAttachmentToDrive } from './drive-upload';
import { taskFetch } from './task-http';
vi.mock('./task-http', () => ({ taskFetch: vi.fn() }));
afterEach(() => vi.unstubAllGlobals());
it('TTD-AUD-99 browser sends only metadata to ttd and 8 MiB chunks to Drive', async () => {
  const session = {
    upload_url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',
    upload_id: 'signed',
  };
  vi.mocked(taskFetch).mockResolvedValueOnce(session).mockResolvedValueOnce({ id: 'attachment' });
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      new Response(null, { status: 308, headers: { Range: `bytes=0-${8 * 1024 * 1024 - 1}` } }),
    )
    .mockResolvedValueOnce(Response.json({ id: 'drive-file' }));
  vi.stubGlobal('fetch', fetcher);
  const progress = vi.fn();
  await uploadAttachmentToDrive(
    'task',
    new File([new Uint8Array(8 * 1024 * 1024 + 4)], 'x.txt', { type: 'text/plain' }),
    progress,
  );
  expect(taskFetch).toHaveBeenNthCalledWith(
    1,
    'POST',
    '/api/v1/tasks/task/attachments/drive-session',
    { name: 'x.txt', mime_type: 'text/plain', size: 8 * 1024 * 1024 + 4 },
  );
  expect(taskFetch).toHaveBeenNthCalledWith(
    2,
    'POST',
    '/api/v1/tasks/task/attachments/drive-complete',
    { upload_id: 'signed', drive_file_id: 'drive-file' },
  );
  for (const [url, init] of fetcher.mock.calls as [URL, RequestInit][]) {
    expect(String(url)).toContain('www.googleapis.com/upload/');
    expect((init.body as Blob).size).toBeLessThanOrEqual(8 * 1024 * 1024);
    expect(init.headers).not.toHaveProperty('Authorization');
  }
  expect(progress).toHaveBeenLastCalledWith(1);
});
it('TTD-AUD-99 browser resumes from the acknowledged range after an interruption', async () => {
  vi.mocked(taskFetch)
    .mockResolvedValueOnce({
      upload_url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=test',
      upload_id: 'signed',
    })
    .mockResolvedValueOnce({ id: 'attachment' });
  const fetcher = vi
    .fn()
    .mockRejectedValueOnce(new TypeError('network'))
    .mockResolvedValueOnce(new Response(null, { status: 308, headers: { Range: 'bytes=0-1' } }))
    .mockResolvedValueOnce(Response.json({ id: 'drive-file' }));
  vi.stubGlobal('fetch', fetcher);
  await uploadAttachmentToDrive('task', new File(['data'], 'x.txt', { type: 'text/plain' }));
  expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({ 'Content-Range': 'bytes */4' });
  expect(fetcher.mock.calls[2]?.[1]?.headers).toMatchObject({ 'Content-Range': 'bytes 2-3/4' });
});

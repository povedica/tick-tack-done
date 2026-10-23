import { ApiError } from '@reflexionia/sdk';
import { taskFetch } from './task-http';
const CHUNK_BYTES = 8 * 1024 * 1024;
export const MAX_DIRECT_ATTACHMENT_BYTES = 100 * 1024 * 1024;
function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function mime(file: File): string {
  if (file.type) return file.type;
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  return (
    (
      {
        txt: 'text/plain',
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        gif: 'image/gif',
        webp: 'image/webp',
      } as Record<string, string>
    )[extension ?? ''] ?? 'application/octet-stream'
  );
}
/** Only metadata goes to ttd. The session URI authorizes this one Drive file. */
export async function uploadAttachmentToDrive(
  taskId: string,
  file: File,
  onProgress?: (progress: number) => void,
): Promise<void> {
  if (file.size <= 0 || file.size > MAX_DIRECT_ATTACHMENT_BYTES)
    throw new ApiError(413, 'payload_too_large', 'Direct upload limit is 100 MiB');
  const session = record(
    await taskFetch('POST', `/api/v1/tasks/${taskId}/attachments/drive-session`, {
      name: file.name,
      mime_type: mime(file),
      size: file.size,
    }),
  );
  if (typeof session.upload_url !== 'string' || typeof session.upload_id !== 'string')
    throw new ApiError(502, 'drive_invalid_session', 'Invalid Drive upload session');
  const url = new URL(session.upload_url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'www.googleapis.com' ||
    url.pathname !== '/upload/drive/v3/files' ||
    !url.searchParams.has('upload_id')
  )
    throw new ApiError(502, 'drive_invalid_session', 'Invalid Drive upload session');
  let offset = 0;
  let retries = 0;
  let completed: string | null = null;
  const status = () =>
    fetch(url, {
      method: 'PUT',
      headers: { 'Content-Range': `bytes */${String(file.size)}` },
      credentials: 'omit',
      signal: AbortSignal.timeout(60000),
    });
  while (completed === null) {
    let response: Response;
    try {
      const end = Math.min(offset + CHUNK_BYTES, file.size);
      response =
        offset < file.size
          ? await fetch(url, {
              method: 'PUT',
              headers: {
                'Content-Range': `bytes ${String(offset)}-${String(end - 1)}/${String(file.size)}`,
              },
              body: file.slice(offset, end),
              credentials: 'omit',
              signal: AbortSignal.timeout(60000),
            })
          : await status();
      if (response.status >= 500) throw new Error('Retry Drive upload');
    } catch (error) {
      if (++retries > 3) throw error;
      response = await status();
    }
    if (response.status === 308) {
      const range = /^bytes=0-(\d+)$/.exec(response.headers.get('Range') ?? '');
      const next = range ? Number(range[1]) + 1 : 0;
      if (next < 0 || next > file.size || (next <= offset && ++retries > 3))
        throw new ApiError(502, 'drive_upload_stalled', 'Drive upload did not advance');
      if (next > offset) retries = 0;
      offset = next;
      onProgress?.(offset / file.size);
      continue;
    }
    const metadata = record(await response.json().catch(() => null));
    if (!response.ok) {
      const error = record(metadata.error);
      const errors = Array.isArray(error.errors) ? error.errors.map(record) : [];
      if (errors.some((row) => row.reason === 'storageQuotaExceeded'))
        throw new ApiError(507, 'drive_quota_exceeded', 'Google Drive quota exceeded');
      throw new ApiError(response.status, 'drive_upload_failed', 'Google Drive upload failed');
    }
    if (typeof metadata.id !== 'string')
      throw new ApiError(502, 'drive_invalid_metadata', 'Drive did not confirm the upload');
    completed = metadata.id;
    onProgress?.(1);
  }
  await taskFetch('POST', `/api/v1/tasks/${taskId}/attachments/drive-complete`, {
    upload_id: session.upload_id,
    drive_file_id: completed,
  });
}

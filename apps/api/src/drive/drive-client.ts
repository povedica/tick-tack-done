import { DomainException } from '../http/domain.exception.js';
/** One 7.75 MiB application buffer plus at most a 256 KiB incoming fragment. */
export const DRIVE_STREAM_CHUNK_BYTES = 31 * 256 * 1024;
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable';
const FIELDS = 'id,name,mimeType,size,webViewLink,iconLink,parents,trashed,appProperties';
export interface DriveFile {
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
  iconLink?: string;
  thumbnailLink?: string;
  parents?: string[];
  trashed?: boolean;
  appProperties?: Record<string, string>;
}
export function validDriveUploadUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.googleapis.com' &&
      url.port === '' &&
      url.username === '' &&
      url.password === '' &&
      url.pathname === '/upload/drive/v3/files' &&
      url.searchParams.has('upload_id')
    );
  } catch {
    return false;
  }
}
export class DriveClient {
  constructor(
    private readonly token: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  private async request(
    url: string,
    init: Omit<RequestInit, 'headers'> & { headers?: Record<string, string> } = {},
  ): Promise<Response> {
    const response = await this.fetcher(url, {
      ...init,
      headers: { Authorization: `Bearer ${this.token}`, ...init.headers },
      signal: AbortSignal.timeout(60000),
    });
    if (response.ok || response.status === 308) return response;
    const body = (await response.json().catch(() => null)) as {
      error?: { errors?: { reason?: string }[] };
    } | null;
    if (body?.error?.errors?.some((error) => error.reason === 'storageQuotaExceeded'))
      throw new DomainException(507, 'drive_quota_exceeded', 'Google Drive quota exceeded');
    if (response.status === 403 && body?.error?.errors?.some(error=>error.reason==='insufficientPermissions')) throw new DomainException(409,'drive_reauth_required','Reconnect Google Drive to grant drive.file access');
    if (response.status === 401)
      throw new DomainException(409, 'drive_reauth_required', 'Reconnect Google Drive');
    if (response.status === 404)
      throw new DomainException(404, 'drive_file_not_found', 'The file is no longer in Drive');
    throw new DomainException(502, 'drive_request_failed', 'Google Drive request failed', {
      upstream_status: response.status,
    });
  }
  async file(id: string, fields = FIELDS): Promise<DriveFile> {
    return (await (
      await this.request(
        `${API}/files/${encodeURIComponent(id)}?fields=${encodeURIComponent(fields)}`,
      )
    ).json()) as DriveFile;
  }
  async find(query: string): Promise<DriveFile[]> {
    const result = (await (
      await this.request(
        `${API}/files?q=${encodeURIComponent(query)}&fields=files(${FIELDS})&pageSize=100`,
      )
    ).json()) as { files?: DriveFile[] };
    return result.files ?? [];
  }
  async folder(
    name: string,
    parent: string | null,
    properties: Record<string, string>,
  ): Promise<string> {
    const result = (await (
      await this.request(`${API}/files?fields=id`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mimeType: 'application/vnd.google-apps.folder',
          ...(parent ? { parents: [parent] } : {}),
          appProperties: properties,
        }),
      })
    ).json()) as DriveFile;
    if (!result.id)
      throw new DomainException(502, 'drive_request_failed', 'Drive did not return a folder id');
    return result.id;
  }
  async update(id: string, body: { name?: string; trashed?: boolean }): Promise<void> {
    await this.request(`${API}/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  async session(
    input: {
      name: string;
      mimeType: string;
      size?: number;
      parent: string;
      uploadId: string;
      legacyId?: string;
    },
    origin: string,
  ): Promise<string> {
    const response = await this.request(UPLOAD, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Upload-Content-Type': input.mimeType,
        ...(input.size === undefined ? {} : { 'X-Upload-Content-Length': String(input.size) }),
        Origin: origin,
      },
      body: JSON.stringify({
        name: input.name,
        parents: [input.parent],
        appProperties: {
          ttdUploadId: input.uploadId,
          ...(input.legacyId ? { ttdLegacyAttachmentId: input.legacyId } : {}),
        },
      }),
    });
    const location = response.headers.get('Location') ?? '';
    if (!validDriveUploadUrl(location))
      throw new DomainException(
        502,
        'drive_invalid_session',
        'Drive returned an invalid resumable session',
      );
    return location;
  }
  async upload(
    url: string,
    source: AsyncIterable<Uint8Array>,
    maxBytes: number,
    mimeType = 'application/octet-stream',
  ): Promise<DriveFile> {
    if (!validDriveUploadUrl(url))
      throw new DomainException(400, 'invalid_upload_session', 'Invalid Drive session');
    const buffer = new Uint8Array(DRIVE_STREAM_CHUNK_BYTES);
    let used = 0;
    let offset = 0;
    let total = 0;
    const send = async (final: boolean): Promise<DriveFile | null> => {
      const response = await this.request(url, {
        method: 'PUT',
        headers: {
          'Content-Type': mimeType,
          'Content-Length': String(used),
          'Content-Range': `bytes ${String(offset)}-${String(offset + used - 1)}/${final ? String(total) : '*'}`,
        },
        body: buffer.subarray(0, used),
      });
      if (final) {
        if (response.status === 308)
          throw new DomainException(
            502,
            'drive_incomplete_upload',
            'Drive did not complete the upload',
          );
        return (await response.json()) as DriveFile;
      }
      if (
        response.status !== 308 ||
        response.headers.get('Range') !== `bytes=0-${String(offset + used - 1)}`
      )
        throw new DomainException(
          502,
          'drive_incomplete_upload',
          'Drive did not acknowledge the uploaded range',
        );
      offset += used;
      used = 0;
      return null;
    };
    for await (const fragment of source) {
      if (fragment.byteLength > 256 * 1024)
        throw new DomainException(
          413,
          'stream_chunk_too_large',
          'Upstream stream fragments must be at most 256 KiB',
        );
      total += fragment.byteLength;
      if (total > maxBytes)
        throw new DomainException(
          413,
          'payload_too_large',
          'Attachment exceeds the streaming limit',
        );
      let cursor = 0;
      while (cursor < fragment.byteLength) {
        if (used === buffer.length) await send(false);
        const length = Math.min(buffer.length - used, fragment.byteLength - cursor);
        buffer.set(fragment.subarray(cursor, cursor + length), used);
        used += length;
        cursor += length;
      }
    }
    if (total === 0) throw new DomainException(400, 'empty_attachment', 'Empty attachment');
    const completed = await send(true);
    if (!completed?.id)
      throw new DomainException(502, 'drive_incomplete_upload', 'Drive did not return a file id');
    return completed;
  }
}

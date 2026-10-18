import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception';

const FILE_ID = /^[a-zA-Z0-9_-]{1,200}$/;

export async function downloadDriveFile(
  accessToken: string,
  fileId: string,
): Promise<{ name: string; mimeType: string; bytes: Buffer }> {
  if (!FILE_ID.test(fileId)) {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'file_id is invalid');
  }
  const meta = await driveFetch(
    accessToken,
    `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType`,
  );
  const body = (await meta.json()) as { name?: unknown; mimeType?: unknown };
  const name = typeof body.name === 'string' && body.name.length > 0 ? body.name : 'drive-file';
  const mime = typeof body.mimeType === 'string' ? body.mimeType : 'application/octet-stream';
  const native = mime.startsWith('application/vnd.google-apps.');
  const url = native
    ? `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent('application/pdf')}`
    : `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
  const file = await driveFetch(accessToken, url);
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0) {
    throw new DomainException(HttpStatus.BAD_GATEWAY, 'drive_copy_failed', 'Drive file was empty');
  }
  return {
    name: native && !name.toLowerCase().endsWith('.pdf') ? `${name}.pdf` : name,
    mimeType: native ? 'application/pdf' : mime,
    bytes,
  };
}

async function driveFetch(accessToken: string, url: string): Promise<Response> {
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    throw new DomainException(
      HttpStatus.BAD_GATEWAY,
      'drive_copy_failed',
      'Google Drive refused the file',
    );
  }
  return response;
}

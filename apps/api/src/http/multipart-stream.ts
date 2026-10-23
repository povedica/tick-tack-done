import busboy, { type FileInfo } from 'busboy';
import type { Request } from 'express';
import type { Readable } from 'node:stream';
import { DomainException } from './domain.exception.js';
export async function* multipartFileParts(file: Readable): AsyncGenerator<Uint8Array> {
  for await (const chunk of file as AsyncIterable<Buffer>) yield chunk;
  if ('truncated' in file && file.truncated)
    throw new DomainException(413, 'payload_too_large', 'Attachment exceeds 25 MiB');
}
/** Backpressure reaches the request; there is no disk storage or whole-file buffer. */
export function multipartStream<T>(
  req: Request,
  onFile: (file: Readable, info: FileInfo, fields: ReadonlyMap<string, string>) => Promise<T>,
  maxFiles = 1,
): Promise<{ fields: ReadonlyMap<string, string>; files: T[] }> {
  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        highWaterMark: 64 * 1024,
        fileHwm: 64 * 1024,
        limits: {
          fileSize: 25 * 1024 * 1024,
          files: maxFiles,
          fields: 12,
          fieldSize: 100000,
          parts: maxFiles + 12,
        },
      });
    } catch {
      reject(new DomainException(400, 'validation_failed', 'A multipart request is required'));
      return;
    }
    const fields = new Map<string, string>();
    const files: T[] = [];
    const pending: Promise<void>[] = [];
    let settled = false;
    let chain = Promise.resolve();
    const cleanup = () => req.removeListener('aborted', abort);
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      req.unpipe(parser);
      req.resume();
      reject(error instanceof Error ? error : new Error('Multipart upload failed'));
    };
    const abort = () => {
      fail(new DomainException(400, 'upload_aborted', 'Upload was interrupted'));
      parser.destroy();
    };
    req.once('aborted', abort);
    parser.on('field', (name, value, info) => {
      if (info.valueTruncated || fields.has(name)) {
        fail(new DomainException(400, 'validation_failed', 'Invalid or repeated multipart field'));
        return;
      }
      fields.set(name, value);
    });
    parser.on('file', (_name, file, info) => {
      file.once('limit', () =>
        file.destroy(new DomainException(413, 'payload_too_large', 'Attachment exceeds 25 MiB')),
      );
      file.on('error', fail);
      chain = chain
        .then(async () => {
          if (settled) {
            file.resume();
            return;
          }
          files.push(await onFile(file, info, fields));
        })
        .catch((error: unknown) => {
          file.resume();
          fail(error);
        });
      pending.push(chain);
    });
    parser.once('filesLimit', () => {
      fail(new DomainException(413, 'payload_too_large', 'Too many files'));
    });
    parser.once('fieldsLimit', () => {
      fail(new DomainException(400, 'validation_failed', 'Too many multipart fields'));
    });
    parser.once('partsLimit', () => {
      fail(new DomainException(400, 'validation_failed', 'Too many multipart parts'));
    });
    parser.on('error', () => {
      fail(new DomainException(400, 'validation_failed', 'Malformed multipart request'));
    });
    parser.once('close', () => {
      void Promise.all(pending).then(() => {
        if (!settled) {
          settled = true;
          cleanup();
          resolve({ fields, files });
        }
      });
    });
    req.pipe(parser);
  });
}

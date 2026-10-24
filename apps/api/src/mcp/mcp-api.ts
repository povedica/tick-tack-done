import { mcpSourceHeaders } from './internal-source.js';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { request } from 'node:http';
import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';

/** Loopback transport deliberately re-enters all HTTP guards, DTOs and owner checks. */
export async function requestPublicApi(
  args: Record<string, unknown>,
  authorization: string | undefined,
): Promise<unknown> {
  if (!authorization?.startsWith('Bearer '))
    throw new DomainException(
      HttpStatus.FORBIDDEN,
      'bearer_required',
      'API transport requires the caller bearer token',
    );
  const path = typeof args.path === 'string' ? args.path : '';
  const origin = `http://127.0.0.1:${process.env.PORT ?? '3000'}`;
  const url = new URL(path, origin);
  let decoded: string;
  try {
    decoded = decodeURIComponent(url.pathname);
  } catch {
    throw new DomainException(HttpStatus.BAD_REQUEST, 'validation_failed', 'Invalid API path');
  }
  if (
    url.origin !== origin ||
    !url.pathname.startsWith('/api/v1/') ||
    decoded.includes('\\') ||
    decoded.includes('%') ||
    url.hash ||
    decoded === '/api/v1/mcp' ||
    decoded.startsWith('/api/v1/mcp/')
  ) {
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'Only public API v1 paths excluding MCP are allowed',
    );
  }
  const method = typeof args.method === 'string' ? args.method : 'GET';
  if (method === 'GET' && (args.body !== undefined || args.files !== undefined))
    throw new DomainException(
      HttpStatus.BAD_REQUEST,
      'validation_failed',
      'GET does not accept a body',
    );
  const files = Array.isArray(args.files) ? (args.files as unknown[]).map(multipartFile) : [];
  const boundary = `ttd-${randomUUID()}`;
  const payload = args.body === undefined ? undefined : JSON.stringify(args.body);
  // Only the public path is caller-controlled. Binary chunks are decoded as needed.
  const response = await new Promise<{ status: number; contentType: string; bytes: Buffer }>(
    (resolve, reject) => {
      const outgoing = request(
        {
          hostname: '127.0.0.1',
          port: Number(process.env.PORT ?? '3000'),
          method,
          path: url.pathname + url.search,
          signal: AbortSignal.timeout(30_000),
          headers: {
            Authorization: authorization,
            'Content-Type': files.length
              ? `multipart/form-data; boundary=${boundary}`
              : 'application/json',
            ...mcpSourceHeaders(method, url.pathname + url.search, authorization),
            ...(typeof args.idempotency_key === 'string'
              ? { 'Idempotency-Key': args.idempotency_key }
              : {}),
          },
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
          incoming.on('error', reject);
          incoming.on('end', () => {
            resolve({
              status: incoming.statusCode ?? 500,
              contentType: incoming.headers['content-type'] ?? '',
              bytes: Buffer.concat(chunks),
            });
          });
        },
      );
      outgoing.on('error', reject);
      if (files.length) {
        const write = async () => {
          for (const chunk of multipartChunks(boundary, args.body, files)) {
            if (!outgoing.write(chunk)) await once(outgoing, 'drain');
          }
          outgoing.end();
        };
        void write().catch((error: unknown) => {
          outgoing.destroy(error instanceof Error ? error : new Error('Multipart encoding failed'));
        });
      } else outgoing.end(payload);
    },
  );
  const { bytes, contentType } = response;
  const data: unknown =
    bytes.length === 0
      ? null
      : contentType.includes('json')
        ? JSON.parse(bytes.toString('utf8'))
        : { content_type: contentType, base64: bytes.toString('base64') };
  if (response.status < 200 || response.status >= 300) {
    const body = typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : {};
    const error =
      typeof body.error === 'object' && body.error !== null
        ? (body.error as Record<string, unknown>)
        : {};
    const code = typeof error.code === 'string' ? error.code : 'api_request_failed';
    const message = typeof error.message === 'string' ? error.message : 'REST API request failed';
    const details =
      typeof error.details === 'object' && error.details !== null
        ? (error.details as Record<string, unknown>)
        : {};
    throw new DomainException(response.status, code, message, {
      ...details,
      status: response.status,
      code,
      message,
      body: data,
    });
  }
  return { status: response.status, data };
}

interface MultipartFile {
  field: string;
  filename: string;
  base64: string;
  contentType: string;
}
function multipartFile(value: unknown): MultipartFile {
  const row = typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
  if (
    typeof row.field !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,64}$/.test(row.field) ||
    typeof row.filename !== 'string' ||
    row.filename.length > 240 ||
    typeof row.base64 !== 'string' ||
    row.base64.length % 4 !== 0 ||
    !/^[a-zA-Z0-9+/]*={0,2}$/.test(row.base64) ||
    (row.base64.length * 3) / 4 -
      (row.base64.endsWith('==') ? 2 : row.base64.endsWith('=') ? 1 : 0) >
      25 * 1024 * 1024
  )
    throw new DomainException(
      400,
      'validation_failed',
      'Invalid multipart file or file exceeds 25 MiB',
    );
  return {
    field: row.field,
    filename: row.filename.replace(/[\r\n"]/g, '_'),
    base64: row.base64,
    contentType:
      typeof row.content_type === 'string' &&
      /^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(row.content_type)
        ? row.content_type
        : 'application/octet-stream',
  };
}
function* multipartChunks(
  boundary: string,
  body: unknown,
  files: readonly MultipartFile[],
): Generator<Buffer> {
  if (typeof body === 'object' && body !== null && !Array.isArray(body))
    for (const [key, value] of Object.entries(body)) {
      if (!/^[a-zA-Z0-9_-]{1,64}$/.test(key))
        throw new DomainException(400, 'validation_failed', 'Invalid multipart field');
      yield Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${typeof value === 'string' ? value : JSON.stringify(value)}\r\n`,
      );
    }
  for (const file of files) {
    yield Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="${file.field}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`,
    );
    for (let offset = 0; offset < file.base64.length; offset += 65536)
      yield Buffer.from(file.base64.slice(offset, offset + 65536), 'base64');
    yield Buffer.from('\r\n');
  }
  yield Buffer.from(`--${boundary}--\r\n`);
}

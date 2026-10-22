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
  let body: string | FormData | undefined =
    args.body === undefined ? undefined : JSON.stringify(args.body);
  if (Array.isArray(args.files) && args.files.length > 0) {
    const form = new FormData();
    if (args.body && typeof args.body === 'object')
      for (const [key, value] of Object.entries(args.body))
        form.append(key, typeof value === 'string' ? value : JSON.stringify(value));
    for (const raw of args.files) {
      const file = raw as {
        field: string;
        filename: string;
        base64: string;
        content_type?: string;
      };
      const bytes = Buffer.from(file.base64, 'base64');
      if (bytes.length > 25 * 1024 * 1024)
        throw new DomainException(
          HttpStatus.BAD_REQUEST,
          'validation_failed',
          'File exceeds 25 MB',
        );
      form.append(
        file.field,
        new Blob([bytes], { type: file.content_type ?? 'application/octet-stream' }),
        file.filename,
      );
    }
    body = form;
  }
  // Only the path comes from the caller. Host, protocol and port never come from
  // a supplied URL; node:http also does not follow redirects.
  const encodedBody = body === undefined ? undefined : new Response(body);
  const payload = encodedBody ? Buffer.from(await encodedBody.arrayBuffer()) : undefined;
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
            'Content-Type':
              body instanceof FormData
                ? (encodedBody?.headers.get('content-type') ?? 'application/octet-stream')
                : 'application/json',
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
      outgoing.end(payload);
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

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
  const response = await fetch(url, {
    method,
    redirect: 'manual',
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: authorization,
      ...(body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(typeof args.idempotency_key === 'string'
        ? { 'Idempotency-Key': args.idempotency_key }
        : {}),
    },
    ...(body === undefined ? {} : { body }),
  });
  const contentType = response.headers.get('content-type') ?? '';
  const bytes = Buffer.from(await response.arrayBuffer());
  const data: unknown =
    bytes.length === 0
      ? null
      : contentType.includes('json')
        ? JSON.parse(bytes.toString('utf8'))
        : { content_type: contentType, base64: bytes.toString('base64') };
  if (!response.ok)
    throw new DomainException(HttpStatus.BAD_REQUEST, 'api_request_failed', JSON.stringify(data));
  return { status: response.status, data };
}

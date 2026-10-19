import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { MulterError } from 'multer';

interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details: unknown;
  };
}

const CODE_BY_STATUS: Readonly<Record<number, string>> = {
  [HttpStatus.BAD_REQUEST]: 'validation_failed',
  [HttpStatus.UNAUTHORIZED]: 'unauthorized',
  [HttpStatus.FORBIDDEN]: 'forbidden',
  [HttpStatus.NOT_FOUND]: 'not_found',
  [HttpStatus.CONFLICT]: 'conflict',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'payload_too_large',
  [HttpStatus.TOO_MANY_REQUESTS]: 'rate_limited',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function messageFrom(body: string | object): string {
  if (typeof body === 'string') {
    return body;
  }
  if (!isRecord(body)) {
    return 'Request failed';
  }
  const message = body.message;
  if (typeof message === 'string') {
    return message;
  }
  if (Array.isArray(message) && message.every((item) => typeof item === 'string')) {
    return message.join(', ');
  }
  return 'Request failed';
}

function errorBody(exception: HttpException): ApiErrorBody {
  const status = exception.getStatus();
  const response = exception.getResponse();
  if (typeof response === 'object' && isRecord(response)) {
    const explicit = response.code;
    const message = response.message;
    const details =
      Array.isArray(message) && message.every((item) => typeof item === 'string')
        ? message
        : (response.details ?? null);
    return {
      error: {
        code:
          typeof explicit === 'string' ? explicit : (CODE_BY_STATUS[status] ?? 'request_failed'),
        message: messageFrom(response),
        details,
      },
    };
  }
  return {
    error: {
      code: CODE_BY_STATUS[status] ?? 'request_failed',
      message: messageFrom(response),
      details: null,
    },
  };
}

function transportStatus(error: unknown): number | null {
  if (typeof error !== 'object' || error === null) {
    return null;
  }
  const record = error as { status?: unknown; statusCode?: unknown };
  if (typeof record.status === 'number') {
    return record.status;
  }
  if (typeof record.statusCode === 'number') {
    return record.statusCode;
  }
  return null;
}

function isParseError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const type = (error as { type?: unknown }).type;
  return type === 'entity.parse.failed' || error instanceof SyntaxError;
}

function retryAfter(exception: HttpException): number | null {
  const body = exception.getResponse();
  if (!isRecord(body)) {
    return null;
  }
  const details = body.details;
  if (!isRecord(details)) {
    return null;
  }
  const retry = details.retry_after;
  return typeof retry === 'number' ? retry : null;
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    if (exception instanceof MulterError && exception.code === 'LIMIT_FILE_SIZE') {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: {
          code: 'payload_too_large',
          message: 'Attachment exceeds the size limit',
          details: null,
        },
      } satisfies ApiErrorBody);
      return;
    }
    const transport = transportStatus(exception);
    if (transport === HttpStatus.PAYLOAD_TOO_LARGE) {
      response.status(HttpStatus.PAYLOAD_TOO_LARGE).json({
        error: {
          code: 'payload_too_large',
          message: 'Request body is too large',
          details: null,
        },
      } satisfies ApiErrorBody);
      return;
    }
    if (transport === HttpStatus.BAD_REQUEST && isParseError(exception)) {
      response.status(HttpStatus.BAD_REQUEST).json({
        error: { code: 'validation_failed', message: 'Request body is invalid', details: null },
      } satisfies ApiErrorBody);
      return;
    }
    if (exception instanceof HttpException) {
      if (exception.getStatus() === 429) {
        const retry = retryAfter(exception);
        if (retry !== null) {
          response.setHeader('Retry-After', String(retry));
        }
      }
      response.status(exception.getStatus()).json(errorBody(exception));
      return;
    }
    this.logger.error(exception instanceof Error ? exception.message : 'Unhandled error');
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      error: { code: 'internal_error', message: 'Internal server error', details: null },
    } satisfies ApiErrorBody);
  }
}

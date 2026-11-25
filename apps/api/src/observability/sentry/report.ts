import * as Sentry from '@sentry/nestjs';
import { safePath } from '../redact.js';
import { sentryActive } from './sentry.js';

export interface ServerErrorContext {
  readonly route: string;
  readonly requestId: string | null;
  readonly userId: string | null;
  readonly mcpMethod?: string | undefined;
  readonly mcpTool?: string | undefined;
}

/** One event per 5xx (CA-01, CA-06). Never throws, never blocks the response. */
export function reportServerError(error: unknown, context: ServerErrorContext): void {
  if (!sentryActive()) {
    return;
  }
  try {
    Sentry.withScope((scope) => {
      scope.setTag('component', context.mcpMethod === undefined ? 'api' : 'mcp');
      scope.setTag('route', safePath(context.route));
      if (context.requestId !== null) scope.setTag('request_id', context.requestId);
      if (context.mcpMethod !== undefined) scope.setTag('mcp.method', context.mcpMethod);
      if (context.mcpTool !== undefined) scope.setTag('mcp.tool', context.mcpTool);
      if (context.userId !== null) scope.setUser({ id: context.userId });
      Sentry.captureException(error);
    });
  } catch {
    // The reporter must never change the response.
  }
}

import * as Sentry from '@sentry/nestjs';
import { safePath } from '../redact.js';
import { sentryActive } from './sentry.js';

export interface ServerErrorContext {
  readonly route: string;
  readonly requestId: string | null;
  readonly userId: string | null;
}

export interface BackgroundErrorContext {
  readonly queue: string;
  readonly job: string;
  /** Groups a repeating failure so the throttle can keep later ticks. */
  readonly fingerprint?: string | undefined;
}

interface McpFailure {
  readonly method: string;
  readonly tool: string | null;
}

const MCP_METHODS = new Set(['initialize', 'ping', 'tools/list', 'tools/call']);
const mcpFailures = new WeakMap<object, McpFailure>();

/**
 * Marks an internal MCP failure before it reaches the exception filter. Only a
 * known method and a catalog tool name are kept: never the arguments.
 */
export function annotateMcpFailure(error: unknown, method: string, tool: string | null): void {
  if (typeof error === 'object' && error !== null) {
    mcpFailures.set(error, { method: MCP_METHODS.has(method) ? method : 'other', tool });
  }
}

/** One event per 5xx (CA-01, CA-06). Never throws, never blocks the response. */
export function reportServerError(error: unknown, context: ServerErrorContext): void {
  if (!sentryActive()) {
    return;
  }
  const mcp = typeof error === 'object' && error !== null ? mcpFailures.get(error) : undefined;
  try {
    Sentry.withScope((scope) => {
      scope.setTag('component', mcp === undefined ? 'api' : 'mcp');
      scope.setTag('route', safePath(context.route));
      if (context.requestId !== null) scope.setTag('request_id', context.requestId);
      if (mcp !== undefined) scope.setTag('mcp.method', mcp.method);
      if (mcp?.tool != null) scope.setTag('mcp.tool', mcp.tool);
      if (context.userId !== null) scope.setUser({ id: context.userId });
      Sentry.captureException(error);
    });
  } catch {
    // The reporter must never change the response.
  }
}

/** One event per failed job or scheduler phase, in its own isolation scope (CA-07). */
export function reportBackgroundError(error: unknown, context: BackgroundErrorContext): void {
  if (!sentryActive()) {
    return;
  }
  try {
    Sentry.withIsolationScope((scope) => {
      scope.setTag('component', 'worker');
      scope.setTag('queue', context.queue);
      scope.setTag('job', context.job);
      if (context.fingerprint !== undefined) scope.setFingerprint([context.fingerprint]);
      Sentry.captureException(error);
    });
  } catch {
    // A failed report must not turn a handled failure into an unhandled one.
  }
}

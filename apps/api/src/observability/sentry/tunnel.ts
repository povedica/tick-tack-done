import { Injectable } from '@nestjs/common';
import { handleTunnelRequest } from '@sentry/nestjs';
import type { Request, Response } from 'express';
import { SlidingWindowRateLimit } from '../../auth/token-rate-limit.js';

export const TUNNEL_PATH = '/api/v1/sentry-tunnel';
/** Browser envelopes carry one scrubbed error. Anything bigger is not ours. */
export const TUNNEL_MAX_BYTES = 64 * 1024;
const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;
/** Shared ceiling so many clients cannot multiply the per-IP allowance. */
export const TUNNEL_GLOBAL_LIMIT = 300;

type Env = Readonly<Record<string, string | undefined>>;

export interface TunnelSettings {
  readonly webDsn: string;
}

/** Forwarding needs SENTRY_TUNNEL_ENABLED=true and the ttd-web DSN. Otherwise every envelope is dropped. */
export function tunnelSettings(env: Env): TunnelSettings | null {
  const webDsn = env.SENTRY_WEB_DSN?.trim() ?? '';
  if (env.SENTRY_TUNNEL_ENABLED !== 'true' || webDsn.length === 0) {
    return null;
  }
  return { webDsn };
}

type Outcome =
  | { readonly kind: 'drop' }
  | { readonly kind: 'reject'; readonly status: number; readonly retryAfter?: number }
  | { readonly kind: 'forward'; readonly response: globalThis.Response };

/** Same-origin relay for the PWA's error envelopes (#209). It never forwards client IPs, cookies or referers. */
@Injectable()
export class SentryTunnel {
  private readonly settings: TunnelSettings | null;
  private readonly limiter: SlidingWindowRateLimit;
  private readonly globalLimiter: SlidingWindowRateLimit;

  constructor(
    env: Env = process.env,
    now: () => number = Date.now,
    limits?: { readonly perIp?: number; readonly global?: number },
  ) {
    this.settings = tunnelSettings(env);
    this.limiter = new SlidingWindowRateLimit(limits?.perIp ?? RATE_LIMIT, RATE_WINDOW_MS, now);
    this.globalLimiter = new SlidingWindowRateLimit(
      limits?.global ?? TUNNEL_GLOBAL_LIMIT,
      RATE_WINDOW_MS,
      now,
    );
  }

  async handle(req: Request, res: Response): Promise<void> {
    const outcome = await this.relay(req).catch((): Outcome => ({ kind: 'reject', status: 502 }));
    if (outcome.kind === 'drop') {
      res.status(204).end();
      return;
    }
    if (outcome.kind === 'reject') {
      if (outcome.retryAfter !== undefined) {
        res.setHeader('Retry-After', String(outcome.retryAfter));
      }
      res.status(outcome.status).end();
      return;
    }
    const { response } = outcome;
    for (const name of ['content-type', 'retry-after', 'x-sentry-rate-limits']) {
      const value = response.headers.get(name);
      if (value !== null) res.setHeader(name, value);
    }
    res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  }

  private async relay(req: Request): Promise<Outcome> {
    if (this.settings === null) {
      req.resume();
      return { kind: 'drop' };
    }
    const ip = req.ip ?? 'unknown';
    const globalDecision = this.globalLimiter.peek('tunnel');
    const ipDecision = this.limiter.peek(ip);
    if (!globalDecision.allowed || !ipDecision.allowed) {
      req.resume();
      const decision = globalDecision.allowed ? ipDecision : globalDecision;
      return { kind: 'reject', status: 429, retryAfter: decision.retryAfter };
    }
    this.globalLimiter.consume('tunnel');
    this.limiter.consume(ip);
    const declared = Number(req.header('content-length') ?? 'NaN');
    if (Number.isFinite(declared) && declared > TUNNEL_MAX_BYTES) {
      req.resume();
      return { kind: 'reject', status: 413 };
    }
    if (req.readableEnded) {
      // The JSON parser already consumed it: envelopes are not JSON documents.
      return { kind: 'reject', status: 415 };
    }
    const body = await readLimited(req, TUNNEL_MAX_BYTES);
    if (body === null) {
      return { kind: 'reject', status: 413 };
    }
    if (envelopeDsn(body) !== this.settings.webDsn) {
      return { kind: 'reject', status: 403 };
    }
    const headers = new Headers({
      'content-type': 'application/x-sentry-envelope',
      'content-length': String(body.length),
    });
    const origin = req.header('origin');
    if (origin !== undefined) headers.set('origin', origin);
    const forwarded = new Request(`http://localhost${TUNNEL_PATH}`, {
      method: 'POST',
      headers,
      body: new Uint8Array(body),
    });
    const response = await handleTunnelRequest(forwarded, {
      allowedDsns: [this.settings.webDsn],
    });
    return { kind: 'forward', response };
  }
}

function envelopeDsn(body: Buffer): string | null {
  const newline = body.indexOf(10);
  const line = body.subarray(0, newline < 0 ? body.length : newline).toString('utf8');
  try {
    const header = JSON.parse(line) as { dsn?: unknown } | null;
    return typeof header?.dsn === 'string' ? header.dsn : null;
  } catch {
    return null;
  }
}

/** Past `max` the rest is drained and discarded, so the 413 still reaches the client. */
function readLimited(req: Request, max: number): Promise<Buffer | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let overflow = false;
    req.on('data', (chunk: Buffer | string) => {
      if (overflow) return;
      const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      size += bytes.length;
      if (size > max) {
        overflow = true;
        chunks.length = 0;
        return;
      }
      chunks.push(bytes);
    });
    req.on('end', () => {
      resolve(overflow ? null : Buffer.concat(chunks));
    });
    req.on('error', reject);
  });
}

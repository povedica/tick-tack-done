import { Injectable } from '@nestjs/common';

/** Section 10.1. One thousand requests per token per fifteen minutes. */
export const TOKEN_RATE_LIMIT = 1000;
export const TOKEN_RATE_WINDOW_MS = 15 * 60 * 1000;

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAt: number;
  readonly retryAfter: number;
}

export class SlidingWindowRateLimit {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit = TOKEN_RATE_LIMIT,
    private readonly windowMs = TOKEN_RATE_WINDOW_MS,
    private readonly now: () => number = Date.now,
  ) {}

  consume(tokenId: string): RateLimitDecision {
    const now = this.now();
    const previous = this.prune(tokenId, now);
    const decision = this.decide(previous, now);
    if (!decision.allowed) {
      this.hits.set(tokenId, previous);
      return decision;
    }
    previous.push(now);
    this.hits.set(tokenId, previous);
    return {
      ...decision,
      remaining: this.limit - previous.length,
    };
  }

  /** Current window without recording a hit. */
  peek(tokenId: string): RateLimitDecision {
    return this.decide(this.prune(tokenId, this.now()), this.now());
  }

  reset(tokenId: string): void {
    this.hits.delete(tokenId);
  }

  resetAll(): void {
    this.hits.clear();
  }

  private prune(tokenId: string, now: number): number[] {
    const start = now - this.windowMs;
    return (this.hits.get(tokenId) ?? []).filter((at) => at > start);
  }

  private decide(previous: readonly number[], now: number): RateLimitDecision {
    const oldest = previous[0];
    const resetAtMs = oldest === undefined ? now + this.windowMs : oldest + this.windowMs;
    const resetAt = Math.ceil(resetAtMs / 1000);
    const retryAfter = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    if (previous.length >= this.limit) {
      return { allowed: false, limit: this.limit, remaining: 0, resetAt, retryAfter };
    }
    return {
      allowed: true,
      limit: this.limit,
      remaining: this.limit - previous.length,
      resetAt,
      retryAfter,
    };
  }
}

/**
 * Production stays at {@link TOKEN_RATE_LIMIT}. `TOKEN_RATE_LIMIT_TEST` exists only
 * outside production (CI perf job). `assertRuntimeConfig` refuses it when NODE_ENV=production.
 */
export function resolveTokenRateLimit(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.TOKEN_RATE_LIMIT_TEST;
  if (raw === undefined || raw.length === 0) {
    return TOKEN_RATE_LIMIT;
  }
  if (env.NODE_ENV === 'production') {
    throw new Error('TOKEN_RATE_LIMIT_TEST is refused when NODE_ENV=production');
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 1_000_000) {
    throw new Error('TOKEN_RATE_LIMIT_TEST must be an integer from 1 to 1000000');
  }
  return parsed;
}

@Injectable()
export class TokenRateLimiter {
  private readonly window = new SlidingWindowRateLimit(resolveTokenRateLimit());

  consume(tokenId: string): RateLimitDecision {
    return this.window.consume(tokenId);
  }
}

export function applyRateLimitHeaders(
  response: { setHeader(name: string, value: string): void },
  decision: RateLimitDecision,
): void {
  response.setHeader('X-RateLimit-Limit', String(decision.limit));
  response.setHeader('X-RateLimit-Remaining', String(decision.remaining));
  response.setHeader('X-RateLimit-Reset', String(decision.resetAt));
}

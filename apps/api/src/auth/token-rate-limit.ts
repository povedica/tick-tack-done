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
    const start = now - this.windowMs;
    const previous = (this.hits.get(tokenId) ?? []).filter((at) => at > start);
    const oldest = previous[0];
    const resetAtMs = oldest === undefined ? now + this.windowMs : oldest + this.windowMs;
    const resetAt = Math.ceil(resetAtMs / 1000);
    const retryAfter = Math.max(1, Math.ceil((resetAtMs - now) / 1000));
    if (previous.length >= this.limit) {
      this.hits.set(tokenId, previous);
      return { allowed: false, limit: this.limit, remaining: 0, resetAt, retryAfter };
    }
    previous.push(now);
    this.hits.set(tokenId, previous);
    return {
      allowed: true,
      limit: this.limit,
      remaining: this.limit - previous.length,
      resetAt,
      retryAfter,
    };
  }
}

@Injectable()
export class TokenRateLimiter {
  private readonly window = new SlidingWindowRateLimit();

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

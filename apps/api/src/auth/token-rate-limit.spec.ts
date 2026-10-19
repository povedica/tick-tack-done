import { describe, expect, it } from 'vitest';
import {
  SlidingWindowRateLimit,
  TOKEN_RATE_LIMIT,
  TOKEN_RATE_WINDOW_MS,
} from './token-rate-limit.js';

describe('token rate limit', () => {
  it('RF-2002: refuses the 1001st request inside 15 minutes and allows it after the window', () => {
    let now = 1_000;
    const limiter = new SlidingWindowRateLimit(TOKEN_RATE_LIMIT, TOKEN_RATE_WINDOW_MS, () => now);
    for (let index = 0; index < TOKEN_RATE_LIMIT; index += 1) {
      const decision = limiter.consume('token-1');
      expect(decision.allowed).toBe(true);
      expect(decision.limit).toBe(1000);
    }
    const blocked = limiter.consume('token-1');
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfter).toBe(TOKEN_RATE_WINDOW_MS / 1000);
    expect(limiter.consume('token-2').allowed).toBe(true);

    now = 1_000 + TOKEN_RATE_WINDOW_MS;
    const again = limiter.consume('token-1');
    expect(again.allowed).toBe(true);
    expect(again.remaining).toBe(TOKEN_RATE_LIMIT - 1);
  });
});

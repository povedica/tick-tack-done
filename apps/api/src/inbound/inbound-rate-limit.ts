import { Injectable } from '@nestjs/common';
import { SlidingWindowRateLimit, type RateLimitDecision } from '../auth/token-rate-limit.js';

/** Public inbound mail. Thirty deliveries per address per fifteen minutes. */
export const INBOUND_RATE_LIMIT = 30;
export const INBOUND_RATE_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class InboundRateLimiter {
  private readonly window = new SlidingWindowRateLimit(inboundLimit(), INBOUND_RATE_WINDOW_MS);

  consume(key: string): RateLimitDecision {
    return this.window.consume(key);
  }
}

function inboundLimit(): number {
  const raw = Number(process.env.INBOUND_RATE_LIMIT ?? INBOUND_RATE_LIMIT);
  return Number.isInteger(raw) && raw > 0 ? raw : INBOUND_RATE_LIMIT;
}

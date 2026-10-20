import { HttpStatus, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DomainException } from '../http/domain.exception.js';
import { SlidingWindowRateLimit, type RateLimitDecision } from './token-rate-limit.js';

const WINDOW_MS = 15 * 60 * 1000;
const IP_LIMIT = 10;
const FAILURE_LIMIT = 5;
const REGISTER_LIMIT = 5;

/**
 * Login, registration, OAuth token and TOTP attempts (S-01).
 * Redis outside Vitest, so a process restart does not clear the window.
 */
@Injectable()
export class AttemptLimiter implements OnModuleDestroy {
  private readonly ipWindow = new SlidingWindowRateLimit(IP_LIMIT, WINDOW_MS);
  private readonly failureWindow = new SlidingWindowRateLimit(FAILURE_LIMIT, WINDOW_MS);
  private readonly registerWindow = new SlidingWindowRateLimit(REGISTER_LIMIT, WINDOW_MS);
  private redis: Redis | null = null;

  constructor() {
    const url = process.env.REDIS_URL;
    if (url !== undefined && url.length > 0 && process.env.VITEST !== 'true') {
      this.redis = new Redis(url, { maxRetriesPerRequest: 1, enableOfflineQueue: false });
      this.redis.on('error', () => undefined);
    }
  }

  onModuleDestroy(): void {
    this.redis?.disconnect();
    this.redis = null;
  }

  async assertRegistration(ip: string): Promise<void> {
    const decision = await this.peek(`register:${ip}`);
    if (!decision.allowed) {
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: decision.retryAfter,
      });
    }
  }

  async recordRegistration(ip: string): Promise<void> {
    await this.hit(`register:${ip}`);
  }

  async assertAllowed(ip: string, subject: string): Promise<void> {
    const ipDecision = await this.peek(`ip:${ip}`);
    const failureDecision = await this.peek(`fail:${subject}`);
    const blocked = !ipDecision.allowed
      ? ipDecision
      : !failureDecision.allowed
        ? failureDecision
        : null;
    if (blocked !== null) {
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: blocked.retryAfter,
      });
    }
  }

  async recordFailure(ip: string, subject: string): Promise<void> {
    await this.hit(`ip:${ip}`);
    await this.hit(`fail:${subject}`);
  }

  async recordAttempt(ip: string): Promise<void> {
    await this.hit(`ip:${ip}`);
  }

  async clearSubject(subject: string): Promise<void> {
    this.failureWindow.reset(`fail:${subject}`);
    if (this.redis !== null) {
      await this.redis.del(this.key(`fail:${subject}`));
    }
  }

  private windowFor(bucket: string): {
    readonly window: SlidingWindowRateLimit;
    readonly limit: number;
  } {
    if (bucket.startsWith('register:')) {
      return { window: this.registerWindow, limit: REGISTER_LIMIT };
    }
    if (bucket.startsWith('fail:')) {
      return { window: this.failureWindow, limit: FAILURE_LIMIT };
    }
    return { window: this.ipWindow, limit: IP_LIMIT };
  }

  private async peek(bucket: string): Promise<RateLimitDecision> {
    const selected = this.windowFor(bucket);
    if (this.redis === null) {
      return selected.window.peek(bucket);
    }
    const count = await this.redis.llen(this.key(bucket));
    const ttl = await this.redis.ttl(this.key(bucket));
    const retryAfter = ttl > 0 ? ttl : Math.ceil(WINDOW_MS / 1000);
    return {
      allowed: count < selected.limit,
      limit: selected.limit,
      remaining: Math.max(0, selected.limit - count),
      resetAt: Math.ceil(Date.now() / 1000) + retryAfter,
      retryAfter,
    };
  }

  private async hit(bucket: string): Promise<RateLimitDecision> {
    const selected = this.windowFor(bucket);
    if (this.redis === null) {
      return selected.window.consume(bucket);
    }
    const key = this.key(bucket);
    const count = await this.redis.rpush(key, String(Date.now()));
    if (count === 1) {
      await this.redis.pexpire(key, WINDOW_MS);
    }
    const ttl = await this.redis.pttl(key);
    const retryAfter = Math.max(1, Math.ceil((ttl > 0 ? ttl : WINDOW_MS) / 1000));
    return {
      allowed: count <= selected.limit,
      limit: selected.limit,
      remaining: Math.max(0, selected.limit - count),
      resetAt: Math.ceil(Date.now() / 1000) + retryAfter,
      retryAfter,
    };
  }

  private key(bucket: string): string {
    return `auth-attempt:${bucket}`;
  }
}

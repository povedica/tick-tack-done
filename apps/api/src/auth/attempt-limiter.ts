import { HttpStatus, Injectable, type OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';
import { DomainException } from '../http/domain.exception.js';
import { SlidingWindowRateLimit, type RateLimitDecision } from './token-rate-limit.js';

const WINDOW_MS = 15 * 60 * 1000;
/** Login and TOTP share this volume budget (S-01). */
const DEFAULT_IP_LIMIT = 10;
/**
 * OAuth authorize/token/revoke volume budget (successes count). Sized so a normal
 * ChatGPT connector flow (authorize, consent, code exchange, refresh) fits with retries.
 */
const DEFAULT_OAUTH_IP_LIMIT = 60;
const DEFAULT_FAILURE_LIMIT = 5;
const DEFAULT_REGISTER_LIMIT = 5;

function envLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.length === 0) {
    return fallback;
  }
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Login, registration, OAuth and TOTP attempts (S-01).
 * Redis outside Vitest, so a process restart does not clear the window.
 * OAuth uses a separate IP bucket so connector setup does not starve web login.
 */
@Injectable()
export class AttemptLimiter implements OnModuleDestroy {
  private readonly ipLimit = envLimit('AUTH_IP_LIMIT', DEFAULT_IP_LIMIT);
  private readonly oauthIpLimit = envLimit('AUTH_OAUTH_IP_LIMIT', DEFAULT_OAUTH_IP_LIMIT);
  private readonly failureLimit = envLimit('AUTH_FAILURE_LIMIT', DEFAULT_FAILURE_LIMIT);
  private readonly registerLimit = envLimit('AUTH_REGISTER_LIMIT', DEFAULT_REGISTER_LIMIT);
  private readonly resetIpLimit = envLimit('AUTH_RESET_IP_LIMIT', 5);
  private readonly resetEmailLimit = envLimit('AUTH_RESET_EMAIL_LIMIT', 3);
  private readonly resetConfirmLimit = envLimit('AUTH_RESET_CONFIRM_IP_LIMIT', 20);
  private readonly ipWindow = new SlidingWindowRateLimit(this.ipLimit, WINDOW_MS);
  private readonly oauthIpWindow = new SlidingWindowRateLimit(this.oauthIpLimit, WINDOW_MS);
  private readonly failureWindow = new SlidingWindowRateLimit(this.failureLimit, WINDOW_MS);
  private readonly registerWindow = new SlidingWindowRateLimit(this.registerLimit, WINDOW_MS);
  private readonly resetIpWindow = new SlidingWindowRateLimit(this.resetIpLimit, 15 * 60 * 1000);
  private readonly resetEmailWindow = new SlidingWindowRateLimit(
    this.resetEmailLimit,
    60 * 60 * 1000,
  );
  private readonly shareUserWindow = new SlidingWindowRateLimit(20, 60 * 60 * 1000);
  private readonly shareEmailWindow = new SlidingWindowRateLimit(5, 24 * 60 * 60 * 1000);
  private readonly resetConfirmWindow = new SlidingWindowRateLimit(
    this.resetConfirmLimit,
    15 * 60 * 1000,
  );
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
    await this.assertBuckets([`ip:${ip}`, `fail:${subject}`]);
  }

  /** OAuth authorize/token/revoke: own volume bucket plus the shared failure bucket. */
  async assertOauthAllowed(ip: string, subject: string): Promise<void> {
    await this.assertBuckets([`oauth-ip:${ip}`, `fail:${subject}`]);
  }

  async recordFailure(ip: string, subject: string): Promise<void> {
    await this.hit(`ip:${ip}`);
    await this.hit(`fail:${subject}`);
  }

  async recordAttempt(ip: string): Promise<void> {
    await this.hit(`ip:${ip}`);
  }

  async recordOauthAttempt(ip: string): Promise<void> {
    await this.hit(`oauth-ip:${ip}`);
  }

  async assertNamed(bucket: string): Promise<void> {
    await this.assertBuckets([bucket]);
  }

  async consumeNamed(bucket: string): Promise<void> {
    await this.hit(bucket);
  }

  async allowed(bucket: string): Promise<boolean> {
    return (await this.peek(bucket)).allowed;
  }

  windowMs(bucket: string): number {
    return this.windowFor(bucket).ms;
  }

  async clearSubject(subject: string): Promise<void> {
    this.failureWindow.reset(`fail:${subject}`);
    if (this.redis !== null) {
      await this.redis.del(this.key(`fail:${subject}`));
    }
  }

  private async assertBuckets(buckets: readonly string[]): Promise<void> {
    let blocked: RateLimitDecision | null = null;
    for (const bucket of buckets) {
      const decision = await this.peek(bucket);
      if (!decision.allowed) {
        blocked = decision;
        break;
      }
    }
    if (blocked !== null) {
      throw new DomainException(HttpStatus.TOO_MANY_REQUESTS, 'rate_limited', 'Too many requests', {
        retry_after: blocked.retryAfter,
      });
    }
  }

  private windowFor(bucket: string): {
    readonly window: SlidingWindowRateLimit;
    readonly limit: number;
    readonly ms: number;
  } {
    if (bucket.startsWith('register:')) {
      return { window: this.registerWindow, limit: this.registerLimit, ms: WINDOW_MS };
    }
    if (bucket.startsWith('fail:')) {
      return { window: this.failureWindow, limit: this.failureLimit, ms: WINDOW_MS };
    }
    if (bucket.startsWith('oauth-ip:')) {
      return { window: this.oauthIpWindow, limit: this.oauthIpLimit, ms: WINDOW_MS };
    }
    if (bucket.startsWith('reset-email:')) {
      return {
        window: this.resetEmailWindow,
        limit: this.resetEmailLimit,
        ms: 60 * 60 * 1000,
      };
    }
    if (bucket.startsWith('reset-confirm-ip:')) {
      return {
        window: this.resetConfirmWindow,
        limit: this.resetConfirmLimit,
        ms: 15 * 60 * 1000,
      };
    }
    if (bucket.startsWith('reset-ip:')) {
      return { window: this.resetIpWindow, limit: this.resetIpLimit, ms: 15 * 60 * 1000 };
    }
    if (bucket.startsWith('share-invite-user:')) {
      return { window: this.shareUserWindow, limit: 20, ms: 60 * 60 * 1000 };
    }
    if (bucket.startsWith('share-invite-email:')) {
      return { window: this.shareEmailWindow, limit: 5, ms: 24 * 60 * 60 * 1000 };
    }
    return { window: this.ipWindow, limit: this.ipLimit, ms: WINDOW_MS };
  }

  private async peek(bucket: string): Promise<RateLimitDecision> {
    const selected = this.windowFor(bucket);
    if (this.redis === null) {
      return selected.window.peek(bucket);
    }
    const count = await this.redis.llen(this.key(bucket));
    const ttl = await this.redis.ttl(this.key(bucket));
    const retryAfter = ttl > 0 ? ttl : Math.ceil(selected.ms / 1000);
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
      await this.redis.pexpire(key, selected.ms);
    }
    const ttl = await this.redis.pttl(key);
    const retryAfter = Math.max(1, Math.ceil((ttl > 0 ? ttl : selected.ms) / 1000));
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

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainException } from '../http/domain.exception.js';
import { hashSecret } from './session-cookie.js';
import { AttemptLimiter } from './attempt-limiter.js';

describe('AttemptLimiter OAuth isolation', () => {
  const previousAuthIpLimit = process.env.AUTH_IP_LIMIT;
  const previousOauthIpLimit = process.env.AUTH_OAUTH_IP_LIMIT;
  const previousFailureLimit = process.env.AUTH_FAILURE_LIMIT;
  const previousRegisterLimit = process.env.AUTH_REGISTER_LIMIT;

  beforeEach(() => {
    process.env.AUTH_IP_LIMIT = '2';
    process.env.AUTH_OAUTH_IP_LIMIT = '3';
    process.env.AUTH_FAILURE_LIMIT = '5';
    process.env.AUTH_REGISTER_LIMIT = '2';
  });

  afterEach(() => {
    if (previousAuthIpLimit === undefined) {
      delete process.env.AUTH_IP_LIMIT;
    } else {
      process.env.AUTH_IP_LIMIT = previousAuthIpLimit;
    }
    if (previousOauthIpLimit === undefined) {
      delete process.env.AUTH_OAUTH_IP_LIMIT;
    } else {
      process.env.AUTH_OAUTH_IP_LIMIT = previousOauthIpLimit;
    }
    if (previousFailureLimit === undefined) {
      delete process.env.AUTH_FAILURE_LIMIT;
    } else {
      process.env.AUTH_FAILURE_LIMIT = previousFailureLimit;
    }
    if (previousRegisterLimit === undefined) {
      delete process.env.AUTH_REGISTER_LIMIT;
    } else {
      process.env.AUTH_REGISTER_LIMIT = previousRegisterLimit;
    }
  });

  it('keeps OAuth volume on oauth-ip and does not consume the login IP bucket', async () => {
    const limiter = new AttemptLimiter();
    await limiter.recordOauthAttempt('10.0.0.1');
    await limiter.recordOauthAttempt('10.0.0.1');
    await limiter.recordOauthAttempt('10.0.0.1');
    await expect(limiter.assertOauthAllowed('10.0.0.1', 'oauth:client')).rejects.toBeInstanceOf(
      DomainException,
    );
    await expect(limiter.assertAllowed('10.0.0.1', 'user@example.com')).resolves.toBeUndefined();
  });

  it('keeps login attempts from starving the OAuth bucket', async () => {
    const limiter = new AttemptLimiter();
    await limiter.recordAttempt('10.0.0.2');
    await limiter.recordAttempt('10.0.0.2');
    await expect(limiter.assertAllowed('10.0.0.2', 'user@example.com')).rejects.toBeInstanceOf(
      DomainException,
    );
    await expect(limiter.assertOauthAllowed('10.0.0.2', 'oauth:client')).resolves.toBeUndefined();
  });

  it('still enforces the shared fail subject bucket for OAuth', async () => {
    process.env.AUTH_FAILURE_LIMIT = '2';
    const limiter = new AttemptLimiter();
    await limiter.recordFailure('10.0.0.3', 'oauth:client');
    await limiter.recordFailure('10.0.0.3', 'oauth:client');
    await expect(limiter.assertOauthAllowed('10.0.0.9', 'oauth:client')).rejects.toBeInstanceOf(
      DomainException,
    );
  });

  it('keeps dynamic registration on its own low bucket', async () => {
    const limiter = new AttemptLimiter();
    await limiter.recordRegistration('10.0.0.4');
    await limiter.recordRegistration('10.0.0.4');
    await expect(limiter.assertRegistration('10.0.0.4')).rejects.toBeInstanceOf(DomainException);
    await expect(limiter.assertOauthAllowed('10.0.0.4', 'oauth:client')).resolves.toBeUndefined();
  });

  it('RF-PR-09: reset email uses a 60 minute window and a hashed key', async () => {
    process.env.AUTH_RESET_EMAIL_LIMIT = '2';
    const limiter = new AttemptLimiter();
    const email = 'ada@example.test';
    const bucket = `reset-email:${hashSecret(email)}`;
    expect(bucket).not.toContain(email);
    expect(limiter.windowMs(bucket)).toBe(60 * 60 * 1000);
    expect(limiter.windowMs('reset-ip:10.0.0.8')).toBe(15 * 60 * 1000);
    await limiter.consumeNamed(bucket);
    await limiter.consumeNamed(bucket);
    expect(await limiter.allowed(bucket)).toBe(false);
    await expect(limiter.assertNamed('reset-ip:10.0.0.8')).resolves.toBeUndefined();
  });
});

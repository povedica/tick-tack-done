import { afterEach, describe, expect, it, vi } from 'vitest';
import { DomainException } from '../http/domain.exception.js';
import { humanCheckFromEnv } from './human-check.js';

const ORIGINAL = {
  mode: process.env.PASSWORD_RESET_CAPTCHA,
  secret: process.env.RECAPTCHA_SECRET_KEY,
  score: process.env.RECAPTCHA_MIN_SCORE,
};

afterEach(() => {
  assignEnv('PASSWORD_RESET_CAPTCHA', ORIGINAL.mode);
  assignEnv('RECAPTCHA_SECRET_KEY', ORIGINAL.secret);
  assignEnv('RECAPTCHA_MIN_SCORE', ORIGINAL.score);
  vi.unstubAllGlobals();
});

describe('humanCheckFromEnv', () => {
  it('accepts any token when captcha is off', async () => {
    delete process.env.PASSWORD_RESET_CAPTCHA;
    await expect(humanCheckFromEnv().assert(undefined, 'login')).resolves.toBeUndefined();
  });

  it('RF-PR: recaptcha v3 accepts a matching action above the score floor', async () => {
    process.env.PASSWORD_RESET_CAPTCHA = 'recaptcha';
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    process.env.RECAPTCHA_MIN_SCORE = '0.5';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        score: 0.9,
        action: 'login',
      }),
    );
    await expect(
      humanCheckFromEnv(fetchImpl).assert('token', 'login', '203.0.113.4'),
    ).resolves.toBeUndefined();
    const [, init] = fetchImpl.mock.calls[0] ?? [];
    const body = init?.body;
    const text =
      typeof body === 'string' ? body : body instanceof URLSearchParams ? body.toString() : '';
    expect(text).toContain('secret=test-secret');
    expect(text).toContain('remoteip=203.0.113.4');
  });

  it('rejects a low score, the wrong action, and a missing token', async () => {
    process.env.PASSWORD_RESET_CAPTCHA = 'recaptcha';
    process.env.RECAPTCHA_SECRET_KEY = 'test-secret';
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      jsonResponse({
        success: true,
        score: 0.1,
        action: 'login',
      }),
    );
    await expectCaptchaFailure(humanCheckFromEnv(fetchImpl).assert('token', 'login'));
    fetchImpl.mockResolvedValue(jsonResponse({ success: true, score: 0.9, action: 'other' }));
    await expectCaptchaFailure(humanCheckFromEnv(fetchImpl).assert('token', 'password_reset'));
    await expectCaptchaFailure(humanCheckFromEnv(fetchImpl).assert(undefined, 'login'));
  });
});

async function expectCaptchaFailure(pending: Promise<void>): Promise<void> {
  try {
    await pending;
  } catch (error) {
    expect(error).toBeInstanceOf(DomainException);
    expect((error as DomainException).getResponse()).toMatchObject({ code: 'captcha_failed' });
    return;
  }
  throw new Error('expected captcha_failed');
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function assignEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    if (name === 'PASSWORD_RESET_CAPTCHA') {
      delete process.env.PASSWORD_RESET_CAPTCHA;
    } else if (name === 'RECAPTCHA_SECRET_KEY') {
      delete process.env.RECAPTCHA_SECRET_KEY;
    } else {
      delete process.env.RECAPTCHA_MIN_SCORE;
    }
    return;
  }
  process.env[name] = value;
}

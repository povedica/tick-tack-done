import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';

const SITEVERIFY_URL = 'https://www.google.com/recaptcha/api/siteverify';

/** RF-PR captcha seam. `none` by default. `recaptcha` calls Google reCAPTCHA v3. */
export interface HumanCheck {
  assert(token: string | undefined, action: string, remoteIp?: string): Promise<void>;
}

export class NoHumanCheck implements HumanCheck {
  assert(_token: string | undefined, _action: string, _remoteIp?: string): Promise<void> {
    return Promise.resolve();
  }
}

/** Skeleton only. It never calls Cloudflare and never reads a site key. */
export class TurnstileHumanCheck implements HumanCheck {
  assert(_token: string | undefined, _action: string, _remoteIp?: string): Promise<void> {
    return Promise.reject(captchaFailed());
  }
}

export class RecaptchaHumanCheck implements HumanCheck {
  constructor(
    private readonly secret: string,
    private readonly minScore: number,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async assert(token: string | undefined, action: string, remoteIp?: string): Promise<void> {
    if (
      token === undefined ||
      token.length === 0 ||
      token.length > 4096 ||
      this.secret.length === 0
    ) {
      throw captchaFailed();
    }
    const body = new URLSearchParams({ secret: this.secret, response: token });
    if (remoteIp !== undefined && remoteIp.length > 0 && remoteIp !== 'unknown') {
      body.set('remoteip', remoteIp);
    }
    let payload: unknown;
    try {
      const response = await this.fetchImpl(SITEVERIFY_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body,
        signal: AbortSignal.timeout(5_000),
      });
      payload = await response.json();
    } catch {
      throw captchaFailed();
    }
    if (!isSiteverify(payload) || !payload.success || payload.action !== action) {
      throw captchaFailed();
    }
    if (payload.score < this.minScore) {
      throw captchaFailed();
    }
  }
}

export function humanCheckFromEnv(fetchImpl: typeof fetch = fetch): HumanCheck {
  const mode = process.env.PASSWORD_RESET_CAPTCHA ?? 'none';
  if (mode === '' || mode === 'none') {
    return new NoHumanCheck();
  }
  if (mode === 'turnstile') {
    return new TurnstileHumanCheck();
  }
  if (mode === 'recaptcha') {
    return new RecaptchaHumanCheck(
      process.env.RECAPTCHA_SECRET_KEY ?? '',
      recaptchaMinScore(),
      fetchImpl,
    );
  }
  return new RecaptchaHumanCheck('', 1, fetchImpl);
}

function recaptchaMinScore(): number {
  const raw = process.env.RECAPTCHA_MIN_SCORE;
  if (raw === undefined || raw.length === 0) {
    return 0.5;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    return 0.5;
  }
  return value;
}

function captchaFailed(): DomainException {
  return new DomainException(HttpStatus.BAD_REQUEST, 'captcha_failed', 'Captcha check failed');
}

function isSiteverify(
  value: unknown,
): value is { success: boolean; score: number; action: string } {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.success === 'boolean' &&
    typeof row.score === 'number' &&
    typeof row.action === 'string'
  );
}

import { HttpStatus } from '@nestjs/common';
import { DomainException } from '../http/domain.exception.js';

/** RF-PR captcha seam. v1 ships `none`. Turnstile stays unwired. */
export interface HumanCheck {
  assert(token: string | undefined): Promise<void>;
}

export class NoHumanCheck implements HumanCheck {
  assert(_token: string | undefined): Promise<void> {
    return Promise.resolve();
  }
}

/** Skeleton only. It never calls Cloudflare and never reads a site key. */
export class TurnstileHumanCheck implements HumanCheck {
  assert(_token: string | undefined): Promise<void> {
    return Promise.reject(
      new DomainException(HttpStatus.BAD_REQUEST, 'captcha_failed', 'Captcha is not available'),
    );
  }
}

export function humanCheckFromEnv(): HumanCheck {
  return process.env.PASSWORD_RESET_CAPTCHA === 'turnstile'
    ? new TurnstileHumanCheck()
    : new NoHumanCheck();
}

export interface ThrottleLimits {
  readonly perFingerprint: number;
  readonly fingerprintWindowMs: number;
  readonly perHour: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const MAX_FINGERPRINTS = 500;

/** The per-DSN rate limit is a paid feature: the process throttles itself (D3). */
export function throttleLimits(environment: string): ThrottleLimits {
  return environment === 'staging'
    ? { perFingerprint: 3, fingerprintWindowMs: HOUR, perHour: 60 }
    : { perFingerprint: 10, fingerprintWindowMs: 10 * MINUTE, perHour: 60 };
}

/** Sliding windows per fingerprint and per process. Suppressed events are counted, not sent. */
export class EventThrottle {
  private readonly byFingerprint = new Map<string, number[]>();
  private recent: number[] = [];
  private suppressed = 0;

  constructor(
    private readonly limits: ThrottleLimits,
    private readonly now: () => number = Date.now,
  ) {}

  admit(fingerprint: string): boolean {
    const at = this.now();
    this.recent = this.recent.filter((time) => at - time < HOUR);
    const seen = (this.byFingerprint.get(fingerprint) ?? []).filter(
      (time) => at - time < this.limits.fingerprintWindowMs,
    );
    if (seen.length >= this.limits.perFingerprint || this.recent.length >= this.limits.perHour) {
      this.byFingerprint.set(fingerprint, seen);
      this.suppressed += 1;
      return false;
    }
    seen.push(at);
    this.recent.push(at);
    this.byFingerprint.set(fingerprint, seen);
    this.prune(at);
    return true;
  }

  /** Returns the suppressed count since the last call and resets it. */
  takeSuppressed(): number {
    const count = this.suppressed;
    this.suppressed = 0;
    return count;
  }

  private prune(at: number): void {
    if (this.byFingerprint.size <= MAX_FINGERPRINTS) {
      return;
    }
    for (const [key, times] of this.byFingerprint) {
      if (times.every((time) => at - time >= this.limits.fingerprintWindowMs)) {
        this.byFingerprint.delete(key);
      }
    }
  }
}

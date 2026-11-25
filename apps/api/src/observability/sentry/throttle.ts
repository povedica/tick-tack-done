export interface ThrottleLimits {
  readonly perFingerprint: number;
  readonly fingerprintWindowMs: number;
  readonly perHour: number;
  readonly perDay: number;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MAX_FINGERPRINTS = 500;

/**
 * One process, flat out, must not spend the org's 5_000 errors/month.
 * 5_000 / 30 days ≈ 166; 160 leaves the throttling summary inside the same budget.
 */
export const DAILY_EVENT_CAP = 160;

/**
 * A calendar poll that keeps failing shares one fingerprint. One event per window:
 * the default of 10 per 10 minutes would still send every 5 minute tick.
 */
export function fingerprintCap(fingerprint: string, limits: ThrottleLimits): number {
  return fingerprint.startsWith('calendar-sync|') ? 1 : limits.perFingerprint;
}

/** The per-DSN rate limit is a paid feature: the process throttles itself (D3). */
export function throttleLimits(environment: string): ThrottleLimits {
  const perDay = DAILY_EVENT_CAP;
  return environment === 'staging'
    ? { perFingerprint: 3, fingerprintWindowMs: HOUR, perHour: 60, perDay }
    : { perFingerprint: 10, fingerprintWindowMs: 10 * MINUTE, perHour: 60, perDay };
}

/** Sliding windows per fingerprint, per hour and per day. Suppressed events are counted, not sent. */
export class EventThrottle {
  private readonly byFingerprint = new Map<string, number[]>();
  private recentHour: number[] = [];
  private recentDay: number[] = [];
  private suppressed = 0;

  constructor(
    private readonly limits: ThrottleLimits,
    private readonly now: () => number = Date.now,
  ) {}

  admit(fingerprint: string): boolean {
    const at = this.now();
    this.recentHour = this.recentHour.filter((time) => at - time < HOUR);
    this.recentDay = this.recentDay.filter((time) => at - time < DAY);
    const seen = (this.byFingerprint.get(fingerprint) ?? []).filter(
      (time) => at - time < this.limits.fingerprintWindowMs,
    );
    if (
      seen.length >= fingerprintCap(fingerprint, this.limits) ||
      this.recentHour.length >= this.limits.perHour ||
      this.recentDay.length >= this.limits.perDay
    ) {
      this.byFingerprint.set(fingerprint, seen);
      this.suppressed += 1;
      return false;
    }
    seen.push(at);
    this.recentHour.push(at);
    this.recentDay.push(at);
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

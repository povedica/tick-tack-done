export interface WebThrottleLimits {
  readonly perSession: number;
  readonly perFingerprint: number;
  /** Window for the per-fingerprint count. `null` counts the whole session. */
  readonly windowMs: number | null;
}

interface Stored {
  total: number;
  hits: Record<string, number[]>;
}

const KEY = 'ttd.sentry.throttle';
const MAX_KEYS = 50;

/** Production: 10 per session and 3 per fingerprint. Staging: 3 per fingerprint per hour. */
export function webThrottleLimits(environment: string): WebThrottleLimits {
  return environment === 'staging'
    ? { perSession: 10, perFingerprint: 3, windowMs: 60 * 60 * 1000 }
    : { perSession: 10, perFingerprint: 3, windowMs: null };
}

/** Counts survive reloads in the same tab, so a crash loop cannot spend the quota. */
export class WebThrottle {
  private memory: Stored = { total: 0, hits: {} };

  constructor(
    private readonly limits: WebThrottleLimits,
    private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = sessionStore(),
    private readonly now: () => number = Date.now,
  ) {}

  admit(fingerprint: string): boolean {
    const state = this.read();
    if (state.total >= this.limits.perSession) return false;
    const at = this.now();
    const window = this.limits.windowMs;
    const previous = (state.hits[fingerprint] ?? []).filter(
      (time) => window === null || time > at - window,
    );
    if (previous.length >= this.limits.perFingerprint) return false;
    state.hits[fingerprint] = [...previous, at];
    const keys = Object.keys(state.hits);
    if (keys.length > MAX_KEYS) {
      state.hits = Object.fromEntries(
        keys.slice(-MAX_KEYS).map((key) => [key, state.hits[key] ?? []]),
      );
    }
    state.total += 1;
    this.write(state);
    return true;
  }

  private read(): Stored {
    try {
      const raw = this.storage?.getItem(KEY);
      if (raw !== null && raw !== undefined) {
        const parsed = JSON.parse(raw) as Partial<Stored>;
        if (typeof parsed.total === 'number' && typeof parsed.hits === 'object') {
          return { total: parsed.total, hits: parsed.hits ?? {} };
        }
      }
    } catch {
      /* Private mode or a corrupt value: fall back to memory. */
    }
    return this.memory;
  }

  private write(state: Stored): void {
    this.memory = state;
    try {
      this.storage?.setItem(KEY, JSON.stringify(state));
    } catch {
      /* Memory keeps counting. */
    }
  }
}

function sessionStore(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

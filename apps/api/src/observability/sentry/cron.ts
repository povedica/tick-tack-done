import * as Sentry from '@sentry/nestjs';
import { sentryActive } from './sentry.js';

export const SCHEDULER_MONITOR = 'scheduler-tick';
const DEFAULT_EVERY_TICKS = 5;

/**
 * SENTRY_CRON_EVERY_TICKS: one check-in every N scheduler ticks (one tick per minute).
 * Default 5, about 8.640 check-ins a month. 0 turns the check-in off.
 */
export function cronEveryTicks(env: Readonly<Record<string, string | undefined>>): number {
  const raw = env.SENTRY_CRON_EVERY_TICKS;
  if (raw === undefined || raw.trim() === '') {
    return DEFAULT_EVERY_TICKS;
  }
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 60 ? value : DEFAULT_EVERY_TICKS;
}

/** The only cron monitor of the free plan. Without Sentry it does nothing. */
export class TickHeartbeat {
  private ticks = 0;

  constructor(private readonly every: number) {}

  /**
   * Called after each finished tick. An `ok` check-in goes out every N ticks.
   * A failed tick sends `error` immediately and flushes it, whatever N is.
   */
  beat(ok: boolean): void {
    if (this.every === 0 || !sentryActive()) {
      return;
    }
    if (!ok) {
      this.emit('error');
      return;
    }
    this.ticks += 1;
    if (this.ticks % this.every !== 0) {
      return;
    }
    this.emit('ok');
  }

  private emit(status: 'ok' | 'error'): void {
    try {
      Sentry.captureCheckIn(
        { monitorSlug: SCHEDULER_MONITOR, status },
        {
          schedule: { type: 'interval', value: this.every, unit: 'minute' },
          checkinMargin: this.every,
          maxRuntime: 10,
          timezone: 'UTC',
        },
      );
      if (status === 'error') {
        void Sentry.flush(2_000).catch(() => undefined);
      }
    } catch {
      // A check-in must never stop the scheduler.
    }
  }
}

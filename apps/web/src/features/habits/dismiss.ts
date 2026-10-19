export const HABITS_DISMISS_KEY = 'tick-tack-done.habits.dismissed';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

export function habitsDismissed(stored: string | null, now: number): boolean {
  if (stored === null) {
    return false;
  }
  const at = Number(stored);
  if (!Number.isFinite(at)) {
    return false;
  }
  return now - at < DISMISS_MS;
}

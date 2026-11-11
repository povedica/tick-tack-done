/** Holds a password-reset response until the floor, with symmetric jitter. */
export async function withMinimumDuration<T>(
  work: () => Promise<T>,
  minimumMs: number,
  jitterMs: number,
): Promise<T> {
  const started = Date.now();
  const result = await work();
  const spread = minimumMs === 0 ? 0 : jitterMs;
  const target = minimumMs + Math.round((Math.random() * 2 - 1) * spread);
  const wait = target - (Date.now() - started);
  if (wait > 0) {
    await new Promise((resolve) => {
      setTimeout(resolve, wait);
    });
  }
  return result;
}

export function passwordResetFloorMs(): { ms: number; jitter: number } {
  const raw = Number(process.env.PASSWORD_RESET_MIN_RESPONSE_MS ?? '350');
  const ms = Number.isFinite(raw) && raw >= 0 ? raw : 350;
  return { ms, jitter: ms === 0 ? 0 : 50 };
}

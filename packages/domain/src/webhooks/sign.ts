/** RF-11010. Ten attempts inside a 24 h window, with exponential delay. */

export const WEBHOOK_MAX_ATTEMPTS = 10;
export const WEBHOOK_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function signWebhookBody(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  const hex = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${hex}`;
}

/** Delay before the next try. `attempts` is how many deliveries already happened. */
export function webhookRetryDelayMs(attempts: number): number | null {
  if (attempts >= WEBHOOK_MAX_ATTEMPTS || attempts < 1) {
    return null;
  }
  return Math.min(60_000 * 2 ** (attempts - 1), 4 * 60 * 60 * 1000);
}

export function webhookStillOpen(
  firstAttemptIso: string,
  nowIso: string,
  attempts: number,
): boolean {
  if (attempts >= WEBHOOK_MAX_ATTEMPTS) {
    return false;
  }
  const first = Date.parse(firstAttemptIso);
  const now = Date.parse(nowIso);
  if (Number.isNaN(first) || Number.isNaN(now)) {
    return false;
  }
  return now - first < WEBHOOK_WINDOW_MS;
}

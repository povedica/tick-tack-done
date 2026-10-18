/** Ten attempts inside a 24 h window, with exponential delay. */

import { subtle, utf8 } from '../crypto/web';

export const WEBHOOK_MAX_ATTEMPTS = 10;
export const WEBHOOK_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function signWebhookBody(secret: string, body: string): Promise<string> {
  const key = await subtle().importKey('raw', asBuffer(utf8(secret)), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const signature = await subtle().sign('HMAC', key, utf8(body));
  const hex = [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  return `sha256=${hex}`;
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
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

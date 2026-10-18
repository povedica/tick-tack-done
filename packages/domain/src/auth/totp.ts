/** V1 TOTP (RFC 6238) and recovery codes. SHA-1, 30 s, 6 digits. */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function randomBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31] ?? '';
      bits -= 5;
    }
  }
  if (bits > 0) {
    out += ALPHABET[(value << (5 - bits)) & 31] ?? '';
  }
  return out;
}

export async function totpCode(
  secret: string,
  nowMs: number,
  stepSeconds = 30,
): Promise<string | null> {
  const keyBytes = decodeBase32(secret);
  if (keyBytes === null || Number.isNaN(nowMs)) {
    return null;
  }
  const counter = Math.floor(nowMs / 1000 / stepSeconds);
  const key = await crypto.subtle.importKey(
    'raw',
    asBuffer(keyBytes),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const message = new Uint8Array(8);
  let rest = counter;
  for (let index = 7; index >= 0; index -= 1) {
    message[index] = rest & 0xff;
    rest = Math.floor(rest / 256);
  }
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, message));
  const offset = (hmac[hmac.length - 1] ?? 0) & 0x0f;
  const binary =
    (((hmac[offset] ?? 0) & 0x7f) << 24) |
    (((hmac[offset + 1] ?? 0) & 0xff) << 16) |
    (((hmac[offset + 2] ?? 0) & 0xff) << 8) |
    ((hmac[offset + 3] ?? 0) & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

export async function verifyTotp(
  secret: string,
  code: string,
  nowMs: number,
  window = 1,
): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) {
    return false;
  }
  for (let delta = -window; delta <= window; delta += 1) {
    const candidate = await totpCode(secret, nowMs + delta * 30_000);
    if (candidate === code) {
      return true;
    }
  }
  return false;
}

export function recoveryCodes(random: () => number, count = 8): string[] {
  const codes: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const left = Math.floor(random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
    const right = Math.floor(random() * 0x10000)
      .toString(16)
      .padStart(4, '0');
    codes.push(`${left}-${right}`);
  }
  return codes;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function decodeBase32(source: string): Uint8Array | null {
  const cleaned = source.replace(/=+$/g, '').replace(/\s/g, '').toUpperCase();
  if (cleaned.length === 0 || [...cleaned].some((char) => !ALPHABET.includes(char))) {
    return null;
  }
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const char of cleaned) {
    value = (value << 5) | ALPHABET.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Uint8Array.from(out);
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

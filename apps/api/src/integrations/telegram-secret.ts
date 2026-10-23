import { timingSafeEqual } from 'node:crypto';

const SECRET = /^[A-Za-z0-9_-]{16,256}$/;

export function telegramSecretMatches(header: string | undefined, expected: string): boolean {
  if (!SECRET.test(expected)) {
    return false;
  }
  if (expected.length === 0) {
    return false;
  }
  const given = Buffer.from(header ?? '');
  const right = Buffer.from(expected);
  if (given.length !== right.length) {
    return false;
  }
  return timingSafeEqual(given, right);
}

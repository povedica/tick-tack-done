import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

function passwordListPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    join(here, 'common-passwords.txt'),
    join(here, '..', '..', 'src', 'auth', 'common-passwords.txt'),
  ];
  const found = candidates.find((path) => existsSync(path));
  if (found === undefined) {
    throw new Error('common password list is missing');
  }
  return found;
}

const file = passwordListPath();
const common = new Set(
  readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line.length > 0),
);

/** Local list only. No network lookup. */
export function isCommonPassword(password: string): boolean {
  return common.has(password.toLowerCase());
}

export function commonPasswordCount(): number {
  return common.size;
}

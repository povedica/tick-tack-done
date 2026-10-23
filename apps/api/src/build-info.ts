import { readFileSync } from 'node:fs';
const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as {
  version: string;
};
export const API_VERSION = manifest.version;
export function buildVersion(): string {
  const commit = process.env.GIT_COMMIT ?? 'unknown';
  return `${API_VERSION}+${/^[a-f0-9]{7,40}$/i.test(commit) ? commit.slice(0, 7) : 'unknown'}`;
}

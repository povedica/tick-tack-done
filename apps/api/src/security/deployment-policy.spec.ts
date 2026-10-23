import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const root = new URL('../../../../', import.meta.url);
const files = [
  'Caddyfile',
  'deploy/production/todo.caddy',
  'deploy/staging/staging.caddy',
  'apps/web/security-headers.conf',
];

describe('RF-2005: deployed browser policy supports direct Drive upload and Picker', () => {
  for (const file of files) {
    it(file, () => {
      const config = readFileSync(new URL(file, root), 'utf8');
      const directive = (name: string) => new RegExp(`${name} ([^;]+)`).exec(config)?.[1] ?? '';
      expect(directive('connect-src')).toContain('https://www.googleapis.com');
      expect(directive('script-src')).toContain('https://apis.google.com');
      expect(directive('script-src')).toContain('https://accounts.google.com');
      expect(directive('frame-src')).toContain('https://docs.google.com');
      expect(directive('img-src')).toContain('https://www.google.com');
      expect(directive('script-src')).not.toMatch(/unsafe-inline|unsafe-eval/);
      expect(config).toContain('same-origin-allow-popups');
    });
  }
});

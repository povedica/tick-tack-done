import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadRootEnv } from './load-env.js';

let directory = '';
afterEach(() => {
  vi.unstubAllEnvs();
  delete process.env.RESEND_TEST_SELECTED_ENV;
  if (directory.length > 0) rmSync(directory, { recursive: true, force: true });
});
describe('explicit runtime env selection', () => {
  it('loads the selected file instead of silently falling back to .env', () => {
    directory = mkdtempSync(path.join(tmpdir(), 'resend-env-'));
    const file = path.join(directory, 'staging.env');
    const value = randomUUID();
    writeFileSync(file, `RESEND_TEST_SELECTED_ENV=${value}\n`);
    vi.stubEnv('RUNTIME_ENV_FILE', file);
    loadRootEnv();
    expect(process.env.RESEND_TEST_SELECTED_ENV).toBe(value);
  });
  it('refuses a nonexistent explicit file', () => {
    vi.stubEnv('RUNTIME_ENV_FILE', `/tmp/missing-${randomUUID()}.env`);
    expect(() => {
      loadRootEnv();
    }).toThrow();
  });
});

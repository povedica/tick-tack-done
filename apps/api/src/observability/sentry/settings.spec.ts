import { describe, expect, it } from 'vitest';
import { API_VERSION } from '../../build-info.js';
import { sentrySettings } from './settings.js';

const BASE = { SENTRY_ENABLED: 'true', SENTRY_DSN: 'https://k@o0.ingest.de.sentry.io/1' };
const COMMIT = 'abcdef1234567890abcdef1234567890abcdef12';
const DEPLOY = '1234567abcdef1234567abcdef1234567abcdef1';

function run(env: Record<string, string>) {
  // VITEST is set in this process; the settings must see a production-like env.
  return sentrySettings({ ...BASE, ...env });
}

describe('Sentry settings (#209)', () => {
  it('release is ttd-api@<version>+<sha7> and deploy_sha follows DEPLOY_SHA', () => {
    expect(run({ GIT_COMMIT: COMMIT, DEPLOY_SHA: DEPLOY })).toEqual({
      dsn: BASE.SENTRY_DSN,
      environment: 'development',
      release: `ttd-api@${API_VERSION}+abcdef1`,
      deploySha: '1234567',
    });
  });

  it('an empty DEPLOY_SHA from compose falls back to the image commit', () => {
    expect(run({ GIT_COMMIT: COMMIT, DEPLOY_SHA: '' })?.deploySha).toBe('abcdef1');
    expect(run({})?.deploySha).toBe('unknown');
  });

  it('stays off under Vitest whatever the env says', () => {
    expect(sentrySettings({ ...BASE, VITEST: 'true' })).toBeNull();
  });
});

import * as Sentry from '@sentry/nestjs';
import { afterEach, describe, expect, it } from 'vitest';
import { fakeTransport } from '../../test/helpers/sentry-transport.js';
import { closeSentry } from '../observability/sentry/sentry.js';
import { runSmoke } from './sentry-smoke.js';

const ENABLED = {
  SENTRY_ENABLED: 'true',
  SENTRY_DSN: 'https://public@o0.ingest.de.sentry.io/1',
  GIT_COMMIT: 'abcdef1234567890',
};

afterEach(async () => {
  await closeSentry();
});

describe('sentry smoke', () => {
  it('production sends one info message and no exception', async () => {
    const { transport, captured } = fakeTransport();
    await runSmoke({ ...ENABLED, SENTRY_ENVIRONMENT: 'production' }, { transport });
    await Sentry.flush(2_000);
    const events = captured.events();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      level: 'info',
      message: 'Sentry smoke (production)',
      tags: { component: 'smoke', smoke: 'true' },
    });
    expect(events[0]?.exception).toBeUndefined();
  });

  it('does nothing outside staging and production', async () => {
    const { transport, captured } = fakeTransport();
    await runSmoke({ ...ENABLED, SENTRY_ENVIRONMENT: 'development' }, { transport });
    expect(captured.events()).toEqual([]);
  });
});

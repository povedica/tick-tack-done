// Child process for the CA-07 strict-mode test: an unknown rejection must still end the process.
import { initSentry } from '../../src/observability/sentry/sentry.js';

const dsn = process.argv[2] ?? '';
initSentry({ SENTRY_ENABLED: 'true', SENTRY_DSN: dsn, SENTRY_ENVIRONMENT: 'test-child' });

setTimeout(() => {
  void Promise.reject(new Error('unknown rejection'));
}, 10);
setTimeout(() => {
  process.exit(0);
}, 8_000);

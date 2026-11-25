// Loaded with `node --import ./dist/instrument.js` before the app, so a crash during boot is reported too.
import { loadRootEnv } from './load-env.js';
import { initSentry } from './observability/sentry/sentry.js';

loadRootEnv();
initSentry(process.env);

/**
 * Staging smoke test for Sentry (CA-14). Runs inside the API container only:
 *   docker compose exec -T staging-api node dist/scripts/sentry-smoke.js
 * There is no HTTP route for it. It always exits 0 so a deploy never fails on it.
 */
import * as Sentry from '@sentry/nestjs';
import { activeSentrySettings, closeSentry, initSentry } from '../observability/sentry/sentry.js';

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

async function main(): Promise<void> {
  if (process.env.SENTRY_ENVIRONMENT !== 'staging') {
    say('sentry-smoke: solo se ejecuta con SENTRY_ENVIRONMENT=staging; no se envía nada.');
    return;
  }
  if (!initSentry(process.env, { processHandlers: false })) {
    say('sentry-smoke: Sentry apagado o sin DSN; no se envía nada.');
    return;
  }
  const settings = activeSentrySettings();
  const eventId = Sentry.withScope((scope) => {
    scope.setTag('component', 'smoke');
    scope.setTag('smoke', 'true');
    scope.setLevel('info');
    return Sentry.captureException(new Error('Sentry smoke test (staging)'));
  });
  const sent = await Sentry.flush(5_000);
  say(
    sent
      ? `sentry-smoke: evento ${eventId} entregado al transporte (${settings?.release ?? 'sin release'}); compruébalo en Sentry.`
      : `sentry-smoke: aviso, el evento ${eventId} no salió en 5 s.`,
  );
  await closeSentry();
}

main().catch(() => {
  say('sentry-smoke: aviso, el humo falló; el despliegue sigue.');
});

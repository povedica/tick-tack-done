/**
 * Smoke de Sentry (CA-14). Se ejecuta dentro del contenedor de la API, sin ruta HTTP.
 * Staging lo lanza el deploy. Producción no: se lanza a mano y envía un mensaje info,
 * nunca una excepción. Siempre sale con código 0 para no tumbar un deploy.
 *   docker compose exec -T staging-api node dist/scripts/sentry-smoke.js
 */
import * as Sentry from '@sentry/nestjs';
import {
  activeSentrySettings,
  closeSentry,
  initSentry,
  type SentryInitOptions,
} from '../observability/sentry/sentry.js';

function say(line: string): void {
  process.stdout.write(`${line}\n`);
}

export async function runSmoke(
  env: Readonly<Record<string, string | undefined>>,
  options: SentryInitOptions = {},
): Promise<void> {
  const environment = env.SENTRY_ENVIRONMENT;
  if (environment !== 'staging' && environment !== 'production') {
    say(
      'sentry-smoke: solo staging (excepción de prueba) o production (mensaje info); no se envía nada.',
    );
    return;
  }
  if (!initSentry(env, { processHandlers: false, ...options })) {
    say('sentry-smoke: Sentry apagado o sin DSN; no se envía nada.');
    return;
  }
  const settings = activeSentrySettings();
  const eventId = Sentry.withScope((scope) => {
    scope.setTag('component', 'smoke');
    scope.setTag('smoke', 'true');
    scope.setLevel('info');
    if (environment === 'production') {
      return Sentry.captureMessage('Sentry smoke (production)', 'info');
    }
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

if (process.env.VITEST === undefined) {
  runSmoke(process.env).catch(() => {
    say('sentry-smoke: aviso, el humo falló; el despliegue sigue.');
  });
}

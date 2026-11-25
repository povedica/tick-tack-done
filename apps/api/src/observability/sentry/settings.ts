import { API_VERSION } from '../../build-info.js';

export interface SentrySettings {
  readonly dsn: string;
  readonly environment: string;
  readonly release: string;
  readonly deploySha: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * Off unless SENTRY_ENABLED=true and SENTRY_DSN are both set. Vitest never reports,
 * whatever the developer's .env says (CA-12).
 */
export function sentrySettings(env: Env): SentrySettings | null {
  if (env.SENTRY_ENABLED !== 'true' || env.VITEST !== undefined) {
    return null;
  }
  const dsn = env.SENTRY_DSN?.trim() ?? '';
  if (dsn.length === 0) {
    return null;
  }
  const environment = nonEmpty(env.SENTRY_ENVIRONMENT) ?? 'development';
  const release = nonEmpty(env.SENTRY_RELEASE) ?? `ttd-api@${API_VERSION}+${sha7(env.GIT_COMMIT)}`;
  return { dsn, environment, release, deploySha: sha7(env.DEPLOY_SHA ?? env.GIT_COMMIT) };
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}

export function sha7(value: string | undefined): string {
  return value !== undefined && /^[a-f0-9]{7,40}$/i.test(value) ? value.slice(0, 7) : 'unknown';
}

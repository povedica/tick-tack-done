/**
 * Log and error-report scrubbing. Pure: no Nest, no Prisma, no Sentry.
 * Everything that leaves the process (container log, error reporter) goes through here.
 */

export const MAX_MESSAGE_LENGTH = 300;
const MAX_STACK_FRAMES = 25;

const EMAIL = /[A-Za-z0-9._%+-]{1,64}@[A-Za-z0-9.-]{1,253}\.[A-Za-z]{2,24}/g;
const RFX_TOKEN = /rfx_[a-z]+_[A-Za-z0-9_-]+/g;
const BEARER = /\bBearer\s+[^\s"',;]+/gi;
const SESSION_COOKIE = /__Host-rfx_session(=[^\s;"',]*)?/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const FEED_PATH = /\/feeds\/[^/?#\s"']+/g;
const PUBLIC_LIST_PATH = /\/public\/lists\/[^/?#\s"']+/g;
const PRISMA_CALL = /prisma\.(\w+)\.(\w+)\(/;

/** `/feeds/<secret>` and `/public/lists/<secret>` become `…/:token`. */
export function maskTokenPaths(path: string): string {
  return path.replace(FEED_PATH, '/feeds/:token').replace(PUBLIC_LIST_PATH, '/public/lists/:token');
}

/** Path without query string, ids or secret path segments. */
export function safePath(raw: string): string {
  const path = raw.split('?')[0] ?? raw;
  return maskTokenPaths(path).replace(UUID, ':id');
}

/** No `@` means there is no address. Skipping the pattern avoids a quadratic scan. */
function maskEmail(text: string): string {
  if (!text.includes('@')) return text;
  return text.replace(EMAIL, '[email]');
}

/** Quoted literals in an error message are interpolated values (a title, a note): never kept. */
const QUOTED = /"[^"\n]*"|«[^»\n]*»|“[^”\n]*”/g;

export function scrubText(text: string, max = MAX_MESSAGE_LENGTH): string {
  const scrubbed = maskEmail(
    maskTokenPaths(text)
      .replace(QUOTED, '"…"')
      .replace(SESSION_COOKIE, '[token]')
      .replace(BEARER, 'Bearer [token]')
      .replace(RFX_TOKEN, '[token]'),
  ).replace(UUID, ':id');
  return scrubbed.length > max ? `${scrubbed.slice(0, max - 1)}…` : scrubbed;
}

export interface SafeError {
  readonly name: string;
  readonly message: string;
}

/**
 * Prisma messages interpolate query arguments (a task title, an email).
 * Only the error code and the model.operation survive.
 */
export function describeError(error: unknown): SafeError {
  if (!(error instanceof Error)) {
    return { name: 'NonError', message: typeof error === 'string' ? scrubText(error) : 'Unknown' };
  }
  const name = /^[A-Za-z0-9_$.]{1,60}$/.test(error.name) ? error.name : 'Error';
  if (isPrismaError(error)) {
    return { name, message: prismaSummary(error) };
  }
  return { name, message: scrubText(error.message) };
}

/** Same rules as describeError, for an exception already flattened to type and message. */
export function describeParts(name: string, message: string, code?: string): SafeError {
  return describeError(Object.assign(new Error(message), { name, ...(code ? { code } : {}) }));
}

/** Header line plus stack frames. The original message never appears. */
export function safeStack(error: unknown): string {
  const head = describeError(error);
  const frames =
    error instanceof Error && typeof error.stack === 'string'
      ? error.stack
          .split('\n')
          .filter((line) => /^\s+at\s/.test(line))
          .slice(0, MAX_STACK_FRAMES)
          .map((line) => `    ${scrubText(line.trim(), 500)}`)
      : [];
  return [`${head.name}: ${head.message}`, ...frames].join('\n');
}

export function isPrismaError(error: Error): boolean {
  return (
    error.name.startsWith('PrismaClient') ||
    /^P\d{4}$/.test(codeOf(error) ?? '') ||
    PRISMA_CALL.test(error.message)
  );
}

function prismaSummary(error: Error): string {
  const code = codeOf(error) ?? 'unknown';
  const meta = (error as { meta?: unknown }).meta;
  const metaModel =
    typeof meta === 'object' && meta !== null && 'modelName' in meta
      ? (meta as { modelName?: unknown }).modelName
      : undefined;
  const call = PRISMA_CALL.exec(error.message);
  const model = typeof metaModel === 'string' ? metaModel : (call?.[1] ?? 'unknown');
  const operation = call?.[2] ?? 'unknown';
  return `PrismaError ${safeWord(code)} ${safeWord(model)}.${safeWord(operation)}`;
}

function codeOf(error: Error): string | null {
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function safeWord(value: string): string {
  return /^[A-Za-z0-9_]{1,40}$/.test(value) ? value : 'unknown';
}

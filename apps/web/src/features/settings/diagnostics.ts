interface Input {
  web: { commit: string; builtAt: string };
  api?: Readonly<Record<string, unknown>> | undefined;
  userAgent: string;
  timeZone: string;
}
export function safeCommit(value: unknown): string {
  return typeof value === 'string' && /^[a-f0-9]{7,40}$/i.test(value)
    ? value.slice(0, 7)
    : 'unknown';
}
export function safeVersion(value: unknown): string {
  return typeof value === 'string' && /^\d+\.\d+\.\d+(?:[+-][a-zA-Z0-9.-]+)?$/.test(value)
    ? value
    : 'unknown';
}
export function safeBuildTime(value: unknown): string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T[0-9:.]+Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
    ? value
    : 'unknown';
}
export function buildDiagnostics(input: Input): string {
  const browser = /\b(Edg|Firefox|Chrome|Version)\/(\d+(?:\.\d+){0,3})\b/.exec(input.userAgent);
  let zone = 'unknown';
  try {
    zone = new Intl.DateTimeFormat('en', { timeZone: input.timeZone }).resolvedOptions().timeZone;
  } catch {
    /* Invalid input stays unknown. */
  }
  return [
    `tick-tack-done`,
    `Web: ${safeCommit(input.web.commit)} (${safeBuildTime(input.web.builtAt)})`,
    `API: ${safeCommit(input.api?.commit)} / ${safeVersion(input.api?.version)} (${safeBuildTime(input.api?.built_at)})`,
    `MCP: ${safeVersion(input.api?.mcp_version)}`,
    `Browser: ${browser ? `${browser[1] === 'Version' ? 'Safari' : (browser[1] ?? 'unknown')} ${browser[2] ?? 'unknown'}` : 'unknown'}`,
    `Time zone: ${zone}`,
  ].join('\n');
}

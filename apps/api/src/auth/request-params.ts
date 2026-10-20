/** Express may pass a repeated query key as string[]. OAuth needs a single string. */
export function queryString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    const first: unknown = value[0];
    return typeof first === 'string' ? first : fallback;
  }
  return fallback;
}

export function requestIp(req: { readonly ip?: string }): string {
  return typeof req.ip === 'string' && req.ip.length > 0 ? req.ip : 'unknown';
}

const EXAMPLE_SECRETS = [
  'generar-con-openssl-rand-hex-32',
  'change-me',
  'change-me-openssl-rand-hex-32',
];

/** Refuse a production process that still has the example secret or dev auth (S-08, S-21). */
export function assertRuntimeConfig(): void {
  if (process.env.NODE_ENV !== 'production') {
    return;
  }
  if (process.env.AUTH_MODE === 'dev') {
    throw new Error('AUTH_MODE=dev is refused when NODE_ENV=production');
  }
  const secret = process.env.APP_SECRET ?? '';
  const example = EXAMPLE_SECRETS.some(
    (value) => secret === value || secret.startsWith(`${value}`),
  );
  if (secret.length < 32 || example) {
    throw new Error('APP_SECRET must be at least 32 characters and must not be an example value');
  }
  if ((process.env.SMTP_FROM ?? '').length === 0) {
    throw new Error('SMTP_FROM is required when NODE_ENV=production');
  }
  if ((process.env.VAPID_SUBJECT ?? '').length === 0) {
    throw new Error('VAPID_SUBJECT is required when NODE_ENV=production');
  }
  if ((process.env.PUBLIC_URL ?? '').length === 0) {
    throw new Error('PUBLIC_URL is required when NODE_ENV=production');
  }
}

export function trustProxyHops(): number {
  const raw = process.env.TRUST_PROXY_HOPS ?? '1';
  const hops = Number(raw);
  if (!Number.isInteger(hops) || hops < 0 || hops > 5) {
    return 1;
  }
  return hops;
}

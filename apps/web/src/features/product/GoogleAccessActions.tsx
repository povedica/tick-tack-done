import './google-access.css';

export function googleAuthorizationUrl(value: unknown): string {
  if (typeof value !== 'string') throw new Error('invalid_google_url');
  const url = new URL(value);
  if (url.origin !== 'https://accounts.google.com') throw new Error('invalid_google_url');
  return url.href;
}

export function googleCallbackNotice(params: URLSearchParams): {
  readonly notice: 'connected' | 'error' | 'denied';
  readonly params: URLSearchParams;
} | null {
  const notice = params.get('google');
  if (notice !== 'connected' && notice !== 'error' && notice !== 'denied') return null;
  const cleaned = new URLSearchParams(params);
  cleaned.delete('google');
  return { notice, params: cleaned };
}

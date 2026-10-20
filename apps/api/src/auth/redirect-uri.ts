const CHATGPT_STABLE = 'https://chatgpt.com/connector_platform_oauth_redirect';
const CHATGPT_CALLBACK = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,128}$/;

/**
 * Dynamic registration only accepts ChatGPT's documented redirect URIs
 * (stable issuer-identification callback, or callback-id URI) and loopback HTTP for tests.
 * Comparison later is exact: no wildcards.
 */
export function isDynamicRedirectUri(uri: string): boolean {
  if (!isExactRedirect(uri)) {
    return false;
  }
  if (uri === CHATGPT_STABLE || CHATGPT_CALLBACK.test(uri)) {
    return true;
  }
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:') {
    return false;
  }
  if (url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return false;
  }
  if (url.username !== '' || url.password !== '' || url.hash !== '') {
    return false;
  }
  const path = url.pathname === '/' ? '' : url.pathname;
  return `${url.origin}${path}${url.search}` === uri;
}

export function isExactRedirect(uri: string): boolean {
  return uri.length > 0 && uri.length <= 500 && !uri.includes('*') && !uri.includes('#');
}

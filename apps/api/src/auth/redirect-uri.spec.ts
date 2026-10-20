import { describe, expect, it } from 'vitest';
import { isDynamicRedirectUri, isExactRedirect } from './redirect-uri.js';

describe('redirect URIs', () => {
  it('allows the ChatGPT callbacks and loopback, and rejects wildcards', () => {
    expect(isDynamicRedirectUri('https://chatgpt.com/connector_platform_oauth_redirect')).toBe(
      true,
    );
    expect(isDynamicRedirectUri('https://chatgpt.com/connector/oauth/cb_12345678')).toBe(true);
    expect(isDynamicRedirectUri('http://127.0.0.1:8080/cb')).toBe(true);
    expect(isDynamicRedirectUri('http://localhost:3000/oauth/callback')).toBe(true);
    expect(isDynamicRedirectUri('https://evil.example/cb')).toBe(false);
    expect(isDynamicRedirectUri('https://chatgpt.com/connector/oauth/*')).toBe(false);
    expect(isDynamicRedirectUri('http://localhost.evil/cb')).toBe(false);
    expect(isDynamicRedirectUri('https://127.0.0.1/cb')).toBe(false);
    expect(isExactRedirect('https://example.com/cb')).toBe(true);
    expect(isExactRedirect('https://example.com/*')).toBe(false);
  });
});

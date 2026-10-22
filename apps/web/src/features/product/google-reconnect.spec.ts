// @vitest-environment jsdom
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { expect, it, vi } from 'vitest';
import type * as I18n from '../../i18n';
import { googleAuthorizationUrl, googleCallbackNotice } from './GoogleAccessActions';
import { IntegrationSettings } from './ProductPages';

vi.hoisted(() => {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: { getItem: () => null, setItem: () => undefined, removeItem: () => undefined },
  });
});

vi.mock('../../i18n', async (original) => {
  const actual = await original<typeof I18n>();
  return { ...actual, useMessages: () => actual.messagesFor('es') };
});

it('TTD-AUD-43: a connected Google account offers reconnect without disconnecting first', () => {
  const client = new QueryClient();
  client.setQueryData(['google'], {
    connected: false,
    configured: true,
    authorized: true,
    enabled: true,
    status: 'reauth_required',
    has_connection: true,
  });
  client.setQueryData(['drive'], {
    connected: false,
    configured: true,
    authorized: false,
    enabled: true,
    status: 'permission_required',
  });
  client.setQueryData(['telegram'], { linked: false, configured: false });
  const html = renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client },
      createElement(
        MemoryRouter,
        { initialEntries: ['/settings/integrations'] },
        createElement(IntegrationSettings),
      ),
    ),
  );
  expect(html).toContain('Reconectar Google Calendar');
  expect(html).toContain('Autorizar Google Drive');
  expect(html).toContain('Sin permiso');
  client.clear();
});

it('TTD-AUD-43: unexpected authorization URLs fail instead of silently doing nothing', () => {
  expect(
    googleAuthorizationUrl('https://accounts.google.com/o/oauth2/v2/auth?scope=calendar'),
  ).toContain('https://accounts.google.com/');
  expect(() => googleAuthorizationUrl('https://accounts.google.com.evil.test/oauth')).toThrow();
  expect(() => googleAuthorizationUrl('http://accounts.google.com/oauth')).toThrow();
  expect(() => googleAuthorizationUrl(undefined)).toThrow();
});

it('TTD-AUD-43: consumes callback notice once and retains other query parameters', () => {
  const original = new URLSearchParams('google=connected&tab=drive');
  const callback = googleCallbackNotice(original);
  expect(callback?.notice).toBe('connected');
  expect(callback?.params.toString()).toBe('tab=drive');
  expect(googleCallbackNotice(callback?.params ?? new URLSearchParams())).toBeNull();
  expect(original.get('google')).toBe('connected');
});

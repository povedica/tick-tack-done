import { readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { API_SCOPES } from '../../api/src/auth/scopes';
const base = process.env.R80_LIVE_API;
test.skip(!base, 'Requires the isolated r80 API and synthetic fixture');
test('TTD-AUD-84: MCP focus changes appear in the real web within two seconds', async ({
  page,
  request,
}, info) => {
  const fixture = JSON.parse(readFileSync('/private/tmp/r80-local-fixture.json', 'utf8')) as {
    id: string;
    email: string;
    taskId: string;
  };
  const response = await request.post(`${base}/api/v1/me/tokens`, {
    headers: { 'X-Dev-User-Email': fixture.email },
    data: { name: `R80 live ${Date.now()}`, scopes: [...API_SCOPES] },
  });
  expect(response.status()).toBe(201);
  const token = (await response.json()) as { id: string; token: string };
  const authorization = `Bearer ${token.token}`;
  async function call(name: string, args: Record<string, unknown> = {}) {
    const response = await request.post(`${base}/api/v1/mcp`, {
      headers: { Authorization: authorization },
      data: { jsonrpc: '2.0', id: 84, method: 'tools/call', params: { name, arguments: args } },
    });
    const body = (await response.json()) as {
      result: { isError: boolean; content: { text: string }[] };
    };
    expect(body.result.isError).toBe(false);
    return JSON.parse(body.result.content[0]!.text) as Record<string, unknown>;
  }
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/me') || url.pathname.endsWith('/auth/session')) {
      await route.fulfill({
        json: {
          id: fixture.id,
          email: fixture.email,
          display_name: 'R80 synthetic user',
          csrf_token: 'synthetic-session',
          time_zone: 'Europe/Madrid',
          locale: 'es',
          features: {},
        },
      });
      return;
    }
    if (url.pathname.includes('/events/stream')) {
      await route.fulfill({ status: 204 });
      return;
    }
    const response = await route.fetch({
      url: `${base}${url.pathname}${url.search}`,
      headers: { ...route.request().headers(), Authorization: authorization },
    });
    await route.fulfill({ response });
  });
  let sessionId: string | null = null;
  try {
    await page.goto('/focus');
    await expect(page.getByRole('timer')).toBeVisible();
    const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    const name = info.project.name.replace('-', '_');
    await page.screenshot({
      path: path.resolve('../../docs/audit/evidencias/r80', `84_foco-mcp_antes_${name}.png`),
    });
    if (process.env.R80_LIVE_CAPTURE_ONLY === 'antes') return;
    const started = await call('start_focus', {
      task_id: fixture.taskId,
      type: 'pomodoro',
      minutes: 25,
    });
    sessionId = String(started.id);
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible({
      timeout: 2000,
    });
    await expect(page.locator('.focus-stage > select').first()).toHaveValue(fixture.taskId);
    await page.screenshot({
      path: path.resolve('../../docs/audit/evidencias/r80', `84_foco-mcp_despues_${name}.png`),
    });
    await call('pause_focus');
    await expect(page.getByRole('button', { name: 'Continuar', exact: true })).toBeVisible({
      timeout: 2000,
    });
    await call('resume_focus');
    await expect(page.getByRole('button', { name: 'Pausar', exact: true })).toBeVisible({
      timeout: 2000,
    });
    await call('finish_focus');
    sessionId = null;
  } finally {
    if (sessionId) await call('abort_focus', { id: sessionId });
    await request.delete(`${base}/api/v1/me/tokens/${token.id}`, {
      headers: { 'X-Dev-User-Email': fixture.email },
    });
  }
});

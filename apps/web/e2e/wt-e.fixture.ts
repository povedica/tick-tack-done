import { expect, type Page, type TestInfo } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { r80Fixture } from './r80.fixture';
export async function wtEFixture(page: Page, options: Parameters<typeof r80Fixture>[1] = {}) {
  await r80Fixture(page, options);
  let settings: Record<string, unknown> = {
    pomodoroMinutes: 35,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
    dailyGoal: 8,
  };
  await page.route('**/api/v1/focus/settings', async (route) => {
    if (route.request().method() !== 'GET') {
      const body = route.request().postDataJSON() as { pomodoro_minutes?: number };
      if (body.pomodoro_minutes) settings = { ...settings, pomodoroMinutes: body.pomodoro_minutes };
    }
    await route.fulfill({ json: settings });
  });
}
export async function evidence(page: Page, info: TestInfo, id: string, phase = 'despues') {
  const dir = '../../test-artifacts/audit/evidencias/wt-e';
  await mkdir(dir, { recursive: true });
  await expect(page.locator('body')).toBeVisible();
  await page.screenshot({
    path: `${dir}/${id}_pantalla_${phase}_${info.project.name.replace('wt-e-', '')}.png`,
    fullPage: true,
  });
}

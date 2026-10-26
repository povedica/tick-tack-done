import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-101 quick presets and Settings update the stopped clock and reject 200', async ({
  page,
}) => {
  await r80Fixture(page);
  let settings = {
    pomodoroMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    cyclesBeforeLongBreak: 4,
    autoStartBreaks: false,
    autoStartFocus: false,
    alarmSound: 'bell',
    volume: 70,
    ambientSound: 'none',
    dailyGoal: 8,
  };
  await page.route('**/focus/settings', (route) => {
    if (route.request().method() !== 'GET') {
      const body = route.request().postDataJSON();
      settings = {
        ...settings,
        pomodoroMinutes: body.pomodoro_minutes ?? settings.pomodoroMinutes,
      };
    }
    return route.fulfill({ json: settings });
  });
  await page.goto('/focus');
  await page.getByRole('button', { name: 'Editar duración' }).click();
  const preset = page.getByRole('button', { name: '15', exact: true });
  expect(Math.abs((await preset.boundingBox())!.height - 28)).toBeLessThanOrEqual(1);
  await preset.click();
  await expect(page.getByRole('timer')).toHaveText('15:00');
  await page.getByRole('link', { name: 'Tiempo de Foco', exact: true }).click();
  await page.getByLabel('Duración del pomo', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await page.goto('/focus');
  await expect(page.getByRole('timer')).toHaveText('45:00');
  settings = { ...settings, pomodoroMinutes: 60 };
  await expect(page.getByRole('timer')).toHaveText('60:00', { timeout: 5000 });
  await page.getByRole('link', { name: 'Tiempo de Foco', exact: true }).click();
  await page.getByLabel('Duración del pomo', { exact: true }).fill('200');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  expect(
    await page
      .getByLabel('Duración del pomo', { exact: true })
      .evaluate((field: HTMLInputElement) => field.validity.valid),
  ).toBe(false);
});

test('TTD-AUD-101: a one-minute pomo closes at zero and displays its automatic break within one second', async ({
  page,
}) => {
  await r80Fixture(page);
  const started = '2026-10-22T10:00:00Z';
  let finished = false;
  await page.route('**/focus/settings', (route) =>
    route.fulfill({
      json: {
        pomodoroMinutes: 25,
        shortBreakMinutes: 5,
        longBreakMinutes: 15,
        cyclesBeforeLongBreak: 4,
        autoStartBreaks: true,
      },
    }),
  );
  await page.route('**/focus/sessions**', (route) => {
    if (route.request().method() === 'POST' && route.request().url().endsWith('/finish')) {
      finished = true;
      return route.fulfill({ json: { next: { type: 'short_break' }, auto_started: true } });
    }
    return route.fulfill({
      json: {
        items: [
          {
            id: finished ? 'break' : 'pomo',
            type: finished ? 'short_break' : 'focus',
            planned_minutes: finished ? 5 : 1,
            remaining_seconds: finished ? 300 : 60,
            started_at: finished ? '2026-10-22T10:01:00Z' : started,
            ended_at: null,
            completed: false,
            paused_at: null,
            paused_seconds: 0,
          },
        ],
        next_cursor: null,
      },
    });
  });
  await page.goto('/focus');
  await expect(page.getByRole('timer')).toHaveText('01:00');
  await page.clock.fastForward(60000);
  await expect.poll(() => finished).toBe(true);
  await page.clock.runFor(1000);
  await expect(page.locator('.focus-clock-wrap small')).toHaveText('Empezar descanso');
  await expect(page.getByRole('timer')).toHaveText(/0[45]:[0-5][0-9]/);
});

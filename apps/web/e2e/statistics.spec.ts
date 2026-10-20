import { expect, test, type Page } from '@playwright/test';
function fixtures(empty: boolean, from = '2026-10-19', to = '2026-10-25') {
  const first = from;
  const completed = empty ? 0 : 3;
  const planned = empty ? 0 : 4;
  const trend = [{ date: first, completed, created: empty ? 0 : 5 }];
  const daily = [
    {
      date: first,
      completed,
      created: empty ? 0 : 5,
      planned,
      completion_completed: empty ? 0 : 2,
      focus_seconds: empty ? 0 : 1500,
      focus_minutes: empty ? 0 : 25,
      pomodoros: empty ? 0 : 1,
      habit_percent: empty ? null : 100,
    },
  ];
  const heatmap = Array.from({ length: 365 }, (_, index) => ({
    date: new Date(Date.UTC(2026, 0, 1 + index)).toISOString().slice(0, 10),
    minutes: !empty && index === 291 ? 25 : 0,
    pomodoros: !empty && index === 291 ? 1 : 0,
    level: !empty && index === 291 ? 4 : 0,
  }));
  const distribution = empty
    ? []
    : [{ key: 'list', label: 'Trabajo de prueba', color: null, value: 25, percent: 100 }];
  const achievement = {
    enabled: !empty,
    score: 66,
    level: 'ritmo',
    level_index: 2,
    next_threshold: 80,
    progress_to_next: 53,
    formula: {
      on_time_points: 20,
      late_points: 5,
      priority_points: 15,
      pomodoro_points: 15,
      habit_points: 16,
      overdue_penalty: 5,
      weights: {},
    },
    history: [{ date: first, score: 66 }],
    levels: [],
  };
  const summary = {
    completed,
    completed_previous: empty ? 3 : 6,
    completed_delta_percent: empty ? -100 : -50,
    completion_rate: empty ? null : 50,
    completion_rate_delta_pt: empty ? null : 5,
    completion_completed: empty ? 0 : 2,
    completion_planned: planned,
    focus_minutes: empty ? 0 : 25,
    focus_minutes_delta_percent: null,
    pomodoros: empty ? 0 : 1,
    habit_percent: empty ? null : 100,
    habit_done: empty ? 0 : 1,
    habit_expected: empty ? 0 : 1,
    habit_delta_pt: 0,
    streak_current: empty ? 0 : 2,
    streak_best_year: empty ? 0 : 5,
    achievement,
  };
  const timeline = empty
    ? []
    : [
        {
          id: 'session',
          start: `${first}T10:00:00Z`,
          end: `${first}T10:25:00Z`,
          minutes: 25,
          task_title: 'Tarea de prueba',
          completed: true,
        },
      ];
  const habit = {
    id: 'habit',
    name: 'Leer',
    icon: '🌱',
    color: '#1f9d55',
    streak_current: 2,
    streak_best: 5,
    percent: 100,
    done: 1,
    expected: 1,
    heatmap: heatmap.map((cell) => ({ ...cell, count: cell.level > 0 ? 1 : 0 })),
    weakest_weekday: 1,
  };
  return {
    overview: {
      summary,
      trend,
      daily,
      completion_series: [
        { date: first, rate: empty ? null : 50, completed: empty ? 0 : 2, planned },
      ],
      best_moment: {
        by_weekday: Array.from({ length: 7 }, (_, i) => ({
          weekday: i + 1,
          completed: !empty && i === 0 ? 3 : 0,
        })),
        by_band: { morning: completed, afternoon: 0, evening: 0 },
      },
      phrase: '',
    },
    tasks: {
      trend,
      daily,
      completion_series: [
        { date: first, rate: empty ? null : 50, completed: empty ? 0 : 2, planned },
      ],
      completion_rate: { completed: empty ? 0 : 2, planned, rate: empty ? null : 50 },
      by_list: distribution,
      by_tag: distribution,
      by_priority: empty
        ? []
        : [{ key: 'high', label: 'high', value: 3, percent: 100, color: null }],
      punctuality: {
        sample: completed,
        delay_cap_days: 30,
        capped_samples: empty ? 0 : 1,
        on_time: empty ? 0 : 2,
        late: empty ? 0 : 1,
        on_time_percent: empty ? null : 66.7,
        mean_delay_days: empty ? null : 10,
        median_delay_days: empty ? null : 0,
      },
      age_on_complete: {
        sample: completed,
        mean_days: empty ? null : 4.2,
        median_days: empty ? null : 1,
      },
      overdue_stock: [
        { date: first, under_7: empty ? 0 : 1, days_7_30: empty ? 0 : 2, over_30: empty ? 0 : 3 },
      ],
    },
    focus: {
      focus_minutes: empty ? 0 : 25,
      focus_seconds: empty ? 0 : 1500,
      pomodoros: empty ? 0 : 1,
      completed_sessions: empty ? 0 : 1,
      abandoned_sessions: 0,
      completed_percent: empty ? null : 100,
      interruptions_per_session: empty ? 0 : 0.5,
      trend: [{ date: first, minutes: empty ? 0 : 25, pomodoros: empty ? 0 : 1 }],
      best_hour: empty ? null : 12,
      hours: Array.from({ length: 24 }, (_, hour) => ({
        hour,
        minutes: !empty && hour === 12 ? 25 : 0,
      })),
      timeline_day: first,
      timeline,
      period_timeline: timeline,
      heatmap,
      by_list: distribution,
      by_tag: distribution,
      by_task: distribution,
    },
    habits: {
      habits: empty ? [] : [habit],
      ranking_best: empty ? [] : [habit],
      ranking_worst: empty ? [] : [habit],
      global_series: [{ date: first, percent: empty ? null : 100 }],
    },
    from,
    to,
  };
}
async function mock(page: Page, empty: boolean) {
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    let body: unknown = { items: [], next_cursor: null };
    if (path.endsWith('/auth/session'))
      body = {
        csrf_token: 'test-csrf',
        id: 'fixture',
        email: 'fixture@example.test',
        display_name: 'Pruebas',
      };
    else if (path.endsWith('/me'))
      body = {
        id: 'fixture',
        email: 'fixture@example.test',
        display_name: 'Pruebas',
        time_zone: 'Europe/Madrid',
        theme: 'light',
        locale: 'es',
        features: {},
      };
    else if (path.endsWith('/projects'))
      body = { items: [{ id: 'list', name: 'Trabajo de prueba' }], next_cursor: null };
    else if (path.endsWith('/tags'))
      body = { items: [{ id: 'tag', name: 'Personal de prueba' }], next_cursor: null };
    else if (path.includes('/stats/')) {
      const data = fixtures(
        empty,
        url.searchParams.get('from') ?? undefined,
        url.searchParams.get('to') ?? undefined,
      );
      const kind = path.split('/').pop() as 'overview' | 'tasks' | 'focus' | 'habits';
      body = data[kind] ?? {};
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
}
for (const width of [1280, 390])
  for (const theme of ['light', 'dark'])
    for (const empty of [false, true])
      for (const tab of ['overview', 'tasks', 'focus', 'habits']) {
        test(`RF-2321–2324 visual ${width} ${theme} ${empty ? 'empty' : 'data'} ${tab}`, async ({
          page,
        }) => {
          await page.setViewportSize({ width, height: width === 390 ? 844 : 800 });
          await page.emulateMedia({
            colorScheme: theme === 'dark' ? 'dark' : 'light',
            reducedMotion: 'reduce',
          });
          await page.addInitScript(
            ({ theme }) => {
              localStorage.setItem('tick-tack-done.theme', theme);
              localStorage.setItem('tick-tack-done.locale', 'es');
            },
            { theme },
          );
          await mock(page, empty);
          await page.goto(tab === 'overview' ? '/statistics' : `/statistics/${tab}`);
          await expect(
            page.getByRole('heading', { name: 'Estadísticas', exact: true }),
          ).toBeVisible();
          await expect(page.locator('[role=tabpanel]')).not.toHaveAttribute('aria-busy', 'true');
          await expect(page.locator('.stats-skeleton')).toHaveCount(0);
          if (tab === 'overview') {
            const columns = await page
              .locator('.stats-kpi-grid')
              .evaluate((el) => getComputedStyle(el).gridTemplateColumns.split(' ').length);
            expect(columns).toBe(width === 390 ? 2 : 3);
            if (empty) {
              await expect(page.getByRole('button', { name: 'Hábitos cumplidos —' })).toBeVisible();
              await expect(page.locator('.stats-delta.is-down')).toHaveCount(0);
            } else
              await expect(page.locator('.stats-chart .recharts-surface').first()).toBeVisible();
          }
          if (empty && tab === 'tasks') await expect(page.getByText('Tarde 100 %')).toHaveCount(0);
          if (!empty && tab === 'focus')
            await expect(page.locator('.stats-timeline rect').first()).toBeVisible();
          const overflow = await page
            .locator('.stats-page')
            .evaluate((el) => el.scrollWidth > el.clientWidth + 1);
          expect(overflow).toBe(false);
          await page.screenshot({
            path: `test-results/statistics-${width}-${theme}-${empty ? 'empty' : 'data'}-${tab}.png`,
            fullPage: true,
          });
        });
      }
test('RF-2321 historical navigation, named filters, keyboard and local persistence', async ({
  page,
}) => {
  await mock(page, false);
  await page.goto('/statistics?range=week&from=2026-10-19&to=2026-10-25');
  await page.getByRole('button', { name: 'Período anterior', exact: true }).click();
  await expect(page).toHaveURL(/from=2026-10-12/);
  await page.goBack();
  await expect(page).toHaveURL(/from=2026-10-19/);
  await page.getByRole('button', { name: 'Filtros', exact: true }).click();
  await page.getByLabel('Trabajo de prueba', { exact: true }).click();
  await expect(page.getByLabel('Trabajo de prueba', { exact: true })).toBeChecked();
  await expect(page.locator('.stats-chips')).toContainText('Trabajo de prueba');
  await expect(page).toHaveURL(/list=list/);
  await page.getByRole('tab', { name: 'Resumen', exact: true }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('tab', { name: 'Tareas', exact: true })).toHaveAttribute(
    'aria-selected',
    'true',
  );
  await page.reload();
  await expect(page).toHaveURL(/list=list/);
  await expect(page.locator('.stats-chips')).toContainText('Trabajo de prueba');
});
test('RF-2324 export downloads query data and RF-2321 primary rail precedes Search', async ({
  page,
}) => {
  await mock(page, false);
  await page.goto('/statistics');
  await expect(page.locator('.stats-kpi-grid')).toBeVisible();
  const targets = await page
    .locator('.icon-rail a')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(targets.indexOf('/statistics')).toBe(targets.indexOf('/search') - 1);
  await expect(page.locator('.sidebar a[href="/statistics"]')).toHaveCount(0);
  await page.getByLabel('Exportar', { exact: true }).click();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV', exact: true }).click();
  expect((await download).suggestedFilename()).toMatch(/stats-.*csv/);
});

test('RF-2321/2322 F02: every tab renders each preset and preserves selected dates', async ({
  page,
}) => {
  await mock(page, false);
  await page.goto('/statistics');
  for (const range of ['Hoy', 'Semana', 'Mes', 'Año']) {
    await page.getByRole('button', { name: range, exact: true }).click();
    const from = new URL(page.url()).searchParams.get('from');
    for (const tab of ['Resumen', 'Tareas', 'Foco', 'Hábitos']) {
      await page.getByRole('tab', { name: tab, exact: true }).click();
      await expect(page.locator('[role=tabpanel]')).not.toHaveAttribute('aria-busy', 'true');
      await expect(page.locator('.stats-chart .recharts-surface').first()).toBeVisible();
      expect(new URL(page.url()).searchParams.get('from')).toBe(from);
    }
  }
});

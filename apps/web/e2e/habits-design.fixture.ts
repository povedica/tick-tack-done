import type { Page } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
export async function habitsDesignFixture(page: Page, count = 3) {
  await r80Fixture(page);
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00Z'));
  const today = '2026-10-29';
  const names = [
    'Beber agua',
    'Leer un rato',
    'Salir a caminar',
    'Estirar',
    'Repasar el día',
    'Descansar la vista',
    'Preparar el desayuno',
    'Escribir una línea',
  ];
  const allDays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  const habits = Array.from({ length: count }, (_, i) => ({
    id: `habit-${i}`,
    name: names[i],
    icon: null,
    color: null,
    goal: { period: 'day', target_count: i === 0 ? 8 : 1, times_per_period: i === 0 ? 8 : 1 },
    frequency: i === 2 ? allDays.slice(0, 5) : allDays,
    unit: i === 0 ? 'vasos' : null,
    start_date: '2026-10-01',
    paused: false,
    reminder_time: null,
    motivation_note: null,
    challenge_days: null,
    archived: false,
    sort_order: String(i),
    today: { date: today, count: i === 0 ? 5 : i === 1 ? 1 : 0, note: null, met: i === 1 },
    created_at: '2026-10-01T08:00:00Z',
    updated_at: '2026-10-29T08:00:00Z',
  }));
  const calls: { path: string; body: Record<string, unknown> }[] = [];
  const logs = new Map<string, Map<string, number>>(
    habits.map((h) => [
      h.id,
      new Map([
        ['2026-10-27', h.goal.target_count],
        ['2026-10-28', h.goal.target_count],
        [today, h.today.count],
      ]),
    ]),
  );
  await page.route('**/api/v1/habits**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    const method = route.request().method();
    const id = path.split('/')[2];
    let habit = habits.find((h) => h.id === id);
    if (method !== 'GET') {
      const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
      calls.push({ path, body });
      if (method === 'DELETE' && habit) {
        habits.splice(habits.indexOf(habit), 1);
        logs.delete(habit.id);
        await route.fulfill({ status: 204 });
        return;
      }
      if (path === '/habits') {
        habit = {
          ...habits[0],
          id: `created-${calls.length}`,
          name: '',
          icon: null,
          color: null,
          unit: null,
          start_date: today,
          paused: false,
          motivation_note: null,
          reminder_time: null,
          challenge_days: null,
          archived: false,
          sort_order: '99',
          goal: { period: 'day', target_count: 1, times_per_period: 1 },
          frequency: allDays,
          today: { date: today, count: 0, note: null, met: false },
          created_at: `${today}T00:00Z`,
          updated_at: `${today}T00:00Z`,
          ...body,
        } as (typeof habits)[number];
        habits.push(habit);
        logs.set(habit.id, new Map());
      } else if (habit && path.endsWith('/checkins')) {
        const date = String(body.date),
          value = Number(body.count);
        logs.get(habit.id)?.set(date, value);
        if (date === today)
          habit.today = { ...habit.today, count: value, met: value >= habit.goal.target_count };
        await route.fulfill({
          json: {
            id: 'log',
            habit_id: habit.id,
            date,
            count: value,
            note: null,
            goal_met: value >= habit.goal.target_count,
            streak_broken: false,
          },
        });
        return;
      } else if (habit) Object.assign(habit, body);
    }
    if (path.endsWith('/stats') && habit) {
      const h = habit;
      const cells = Array.from({ length: 365 }, (_, i) => {
        const year = Number(new URL(route.request().url()).searchParams.get('year') ?? 2026);
        const date = new Date(Date.UTC(year, 0, i + 1)).toISOString().slice(0, 10);
        const n = logs.get(h.id)?.get(date) ?? 0;
        return {
          date,
          count: n,
          met: n >= h.goal.target_count,
          scheduled:
            date >= h.start_date &&
            h.frequency.includes(allDays[(new Date(`${date}T12:00Z`).getUTCDay() + 6) % 7]!),
        };
      });
      await route.fulfill({
        json: {
          streak_current: 2,
          streak_best: 5,
          total_checkins: 19,
          completed_days: 19,
          month_checkins: 19,
          completion_percent: { week: 60, month: 80 },
          heatmap: cells,
          aggregate_heatmap: cells.map((c) => ({ date: c.date, scheduled: habits.length, met: 1 })),
          logs: [...(logs.get(h.id) ?? new Map())].map(([date, count]) => ({
            date,
            count,
            note: null,
          })),
        },
      });
      return;
    }
    await route.fulfill({
      status: method === 'POST' && path === '/habits' ? 201 : 200,
      json:
        path === '/habits' && method === 'GET'
          ? { items: habits, next_cursor: null }
          : (habit ?? {}),
    });
  });
  return { habits, calls };
}

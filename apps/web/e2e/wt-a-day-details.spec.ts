import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';
import { wtAFixture } from './wt-a.fixture';

async function dayFixture(page: Page, count: number) {
  await wtAFixture(page);
  const base = {
    project_id: 'Lista-0',
    parent_id: null,
    column_id: null,
    content: '',
    status: 'active',
    kind: 'task',
    priority: 'none',
    start_date: null,
    time_zone: 'Europe/Madrid',
    is_all_day: true,
    repeat_rule: null,
    tag_ids: ['tag-home'],
    checklist_progress: { completed: 0, total: 0 },
    completed_at: null,
    created_at: '2026-10-01T08:00:00Z',
    source: 'manual',
    duration_minutes: 30,
  };
  const taskCount = count === 1 ? 1 : count - 2;
  const tasks = Array.from({ length: taskCount }, (_, i) => ({
    ...base,
    id: `day-task-${i}`,
    title:
      i === 0
        ? 'Revisar el material de la reunión #hogar #personal'
        : `Preparar propuesta ${i + 1} con información para la reunión #personal`,
    priority: ['none', 'low', 'medium', 'high'][i % 4],
    due_date:
      i % 3 === 0
        ? '2026-10-29T12:00:00Z'
        : `2026-10-29T${String(8 + (i % 10)).padStart(2, '0')}:30:00Z`,
    is_all_day: i % 3 === 0,
  })).reverse();
  const events =
    count === 1
      ? []
      : [
          {
            id: 'birthday',
            title: 'Cumpleaños de Ana',
            is_all_day: false,
            starts_at: '2026-10-28T23:00:00Z',
            ends_at: '2026-10-29T23:00:00Z',
            summary: 'Cumpleaños',
            provider: 'google',
          },
          {
            id: 'meeting',
            title: 'Reunión del equipo',
            is_all_day: false,
            starts_at: '2026-10-29T08:00:00Z',
            ends_at: '2026-10-29T09:00:00Z',
            summary: 'Google Calendar',
            provider: 'google',
          },
        ].map((e) => ({
          ...e,
          subscription_id: 'Calendario-0',
          time_zone: 'Europe/Madrid',
          color: '#2563eb',
        }));
  const created: Record<string, unknown>[] = [];
  const completed = new Set<string>();
  await page.route('**/api/v1/**', async (route) => {
    const pathname = new URL(route.request().url()).pathname.replace('/api/v1', '');
    if (pathname === '/projects')
      return route.fulfill({
        json: {
          items: [{ id: 'Lista-0', name: 'Personal', is_inbox: true, color: '#2563eb' }],
          next_cursor: null,
        },
      });
    if (pathname === '/tags')
      return route.fulfill({
        json: { items: [{ id: 'tag-home', name: 'hogar', color: '#e11d48' }], next_cursor: null },
      });
    if (pathname === '/calendar/events')
      return route.fulfill({ json: { tasks: [], external: events } });
    if (pathname === '/tasks' && route.request().method() === 'POST') {
      const body = route.request().postDataJSON() as Record<string, unknown>;
      created.push(body);
      const task = { ...base, ...body, id: `created-${created.length}` };
      tasks.push(task as (typeof tasks)[number]);
      return route.fulfill({ status: 201, json: task });
    }
    if (pathname === '/tasks')
      return route.fulfill({
        json: { items: tasks.filter((task) => !completed.has(task.id)), next_cursor: null },
      });
    if (pathname.endsWith('/complete')) {
      completed.add(pathname.split('/')[2]!);
      return route.fulfill({ json: { id: pathname.split('/')[2], status: 'completed' } });
    }
    return route.fallback();
  });
  return { created, taskCount };
}

for (const count of [1, 6, 20]) {
  test(`Day detail: ${count} items, clear hierarchy, tags, internal scrolling and keyboard close`, async ({
    page,
  }, info) => {
    const fixture = await dayFixture(page, count);
    await page.goto('/calendar/month?date=2026-10-29');
    await page.evaluate(
      (theme) => document.documentElement.setAttribute('data-theme', theme),
      info.project.name.endsWith('dark') ? 'dark' : 'light',
    );
    const cell = page.locator('[data-day="2026-10-29"]');
    const visibleChips = cell.locator('.calendar-cell-items > [aria-hidden="false"]');

    const opener = count > 3 ? cell.locator('.calendar-overflow') : cell.locator('strong button');
    await expect(opener).toBeVisible();
    if (count > 3) await expect(opener).toContainText('más');
    await opener.click();
    const popup = page.locator('.calendar-day-popover');
    await expect(popup).toBeVisible();
    await expect(
      popup.getByRole('heading', { name: 'jueves 29 octubre' }).filter({ visible: true }),
    ).toBeVisible();
    await expect(popup.locator('.calendar-day-row')).toHaveCount(count);
    if (page.viewportSize()!.width > 768) {
      await expect.poll(() => visibleChips.count()).toBeGreaterThan(0);
      expect(await visibleChips.count()).toBeLessThanOrEqual(3);
    }
    await expect(popup.getByRole('checkbox')).toHaveCount(fixture.taskCount);
    await expect(popup.locator('.calendar-day-title').filter({ hasText: '#' })).toHaveCount(0);
    await expect(popup.locator('.ui-tag').filter({ hasText: 'hogar' }).first()).toBeVisible();
    await expect(popup.locator('.ui-tag').filter({ hasText: 'personal' }).first()).toBeVisible();
    await expect(popup.locator('.calendar-day-list').first()).toHaveText('Personal');
    if (count > 1) {
      await expect(popup.getByRole('heading', { name: 'Todo el día', exact: true })).toBeVisible();
      await expect(popup.getByRole('heading', { name: 'Con hora', exact: true })).toBeVisible();
      await expect(popup.locator('.is-event .calendar-day-event-icon')).toHaveCount(2);
      await expect(popup.locator('.is-event input')).toHaveCount(0);
      await expect(popup.locator('time').filter({ hasText: '00:00' })).toHaveCount(0);
      const times = await popup.locator('time').allTextContents();
      expect(times).toEqual([...times].sort());
      const checks = await popup
        .locator('.task-check-hit')
        .evaluateAll((nodes) => nodes.map((node) => Math.round(node.getBoundingClientRect().x)));
      expect(new Set(checks).size).toBe(1);
    }
    const input = popup.getByRole('textbox', { name: 'Añadir tarea a este día' });
    await expect(input).toBeVisible();
    const scroll = popup.locator('.calendar-day-items');
    if (count === 20) {
      expect(await scroll.evaluate((e) => e.scrollHeight > e.clientHeight)).toBe(true);
      await scroll.evaluate((e) => {
        e.scrollTop = e.scrollHeight;
      });
      await expect(input).toBeVisible();
      await scroll.evaluate((e) => {
        e.scrollTop = 0;
      });
    }
    expect(await popup.evaluate((e) => e.scrollHeight <= e.clientHeight + 1)).toBe(true);
    await page.screenshot({
      path: path.resolve(
        '../../test-artifacts/audit/evidencias/wt-a',
        `day_detail_${count}_${info.project.name}.png`,
      ),
    });
    if (count === 6) {
      await input.fill('Nueva tarea de este día');
      await input.press('Enter');
      await expect(input).toHaveValue('');
      expect(fixture.created).toHaveLength(1);
      expect(fixture.created[0]).toMatchObject({
        title: 'Nueva tarea de este día',
        project_id: 'Lista-0',
        is_all_day: true,
        due_date: '2026-10-28T23:00:00.000Z',
        time_zone: 'Europe/Madrid',
      });
      expect(fixture.created[0]).not.toHaveProperty('raw_text');
      await expect(popup.locator('.calendar-day-row')).toHaveCount(7);
    }
    await page.keyboard.press('Escape');
    await expect(popup).toHaveCount(0);
    await expect(opener).toBeFocused();
  });
}

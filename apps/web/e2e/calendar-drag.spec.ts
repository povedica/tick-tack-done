import { test, expect, type Page } from '@playwright/test';

test.use({ timezoneId: 'America/New_York', hasTouch: false });
async function fixture(page: Page, fail = false) {
  await page.clock.setFixedTime(new Date('2026-11-01T12:00:00Z'));
  const patches: Record<string, unknown>[] = [];
  let task = {
    id: 'drag-task',
    project_id: 'inbox',
    parent_id: null,
    column_id: null,
    title: 'Mover esta repetición',
    content: '',
    kind: 'task',
    status: 'active',
    priority: 'high',
    start_date: '2026-10-20T08:00:00.000Z',
    due_date: '2026-10-20T09:00:00.000Z',
    duration_minutes: 60,
    is_all_day: false,
    time_zone: 'Europe/Madrid',
    tag_ids: [],
    repeat_rule: 'FREQ=DAILY',
    repeat_from: 'due_date',
    checklist_progress: { completed: 0, total: 0 },
    created_at: '2026-10-01T00:00:00Z',
    completed_at: null,
    deleted_at: null,
  };
  await page.addInitScript(() => localStorage.setItem('tick-tack-done.account-prefs', '1'));
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    let body: unknown = { items: [], next_cursor: null };
    if (path === '/me' || path === '/auth/session')
      body = {
        id: 'user',
        email: 'test@example.test',
        display_name: 'Test',
        csrf_token: 'test',
        time_zone: 'Europe/Madrid',
        locale: 'es',
        features: {},
      };
    if (path === '/projects')
      body = { items: [{ id: 'inbox', name: 'Bandeja', is_inbox: true }], next_cursor: null };
    if (path === '/tasks') body = { items: [task], next_cursor: null };
    if (path === '/tasks/drag-task') {
      if (route.request().method() === 'PATCH') {
        const patch = route.request().postDataJSON() as Record<string, unknown>;
        patches.push(patch);
        if (fail) {
          fail = false;
          await route.fulfill({
            status: 500,
            json: { error: { code: 'test_failure', message: 'Synthetic failure' } },
          });
          return;
        }
        task = { ...task, ...patch };
      }
      body = task;
    }
    if (path === '/calendar/events')
      body = {
        tasks: [],
        external: [
          {
            id: 'external',
            subscription_id: 'cal',
            calendar_id: 'cal',
            provider: 'google',
            title: 'Evento externo',
            starts_at: '2026-10-21T08:00:00Z',
            ends_at: '2026-10-21T09:00:00Z',
            is_all_day: false,
            time_zone: 'Europe/Madrid',
          },
        ],
      };
    await route.fulfill({ status: 200, json: body });
  });
  return patches;
}
async function point(page: Page, day: string, minute: number) {
  const box = await page.locator(`.hour-col[data-day="${day}"]`).boundingBox();
  if (!box) throw new Error('Missing target');
  const repeated = await page.locator('.hour-board').getAttribute('data-calendar-repeated-hour');
  const axis = repeated !== null && minute >= (Number(repeated) + 1) * 60 ? minute + 60 : minute;
  return { x: box.x + box.width / 2, y: box.y + (axis / 60) * 48 };
}
async function dragTo(page: Page, day: string, minute: number, capture = false) {
  const task = page.locator('[data-calendar-task="drag-task"]');
  const box = await task.boundingBox();
  if (!box) throw new Error('Missing task');
  const target = await point(page, day, minute);
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(target.x, target.y + 4, { steps: 6 });
  const final = await point(page, day, minute);
  await page.mouse.move(final.x, final.y + 4);
  if (capture) await page.screenshot({ path: '/tmp/ttd-drag-preview.png' });
  await page.mouse.up();
}
test('75.5 pointer move preserves duration and recurrence, undo restores the original range', async ({
  page,
}) => {
  const patches = await fixture(page);
  await page.goto('/calendar/week?date=2026-10-20');
  await expect(page.locator('[data-calendar-task="drag-task"]')).toBeVisible();
  await dragTo(page, '2026-10-22', 675, true);
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]).toMatchObject({
    start_date: '2026-10-22T09:15:00.000Z',
    due_date: '2026-10-22T10:15:00.000Z',
    duration_minutes: 60,
  });
  expect(patches[0]).not.toHaveProperty('repeat_rule');
  await expect(page.getByText('Solo se ha movido esta repetición', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Deshacer', exact: true }).click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toMatchObject({
    start_date: '2026-10-20T08:00:00.000Z',
    due_date: '2026-10-20T09:00:00.000Z',
    duration_minutes: 60,
  });
  await expect(page).not.toHaveURL(/task=/);
});
test('75.5 keyboard resize, cancellation and DST use the account zone', async ({ page }) => {
  const patches = await fixture(page);
  await page.goto('/calendar/week?date=2026-10-20');
  const task = page.locator('[data-calendar-task="drag-task"]');
  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Enter');
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]?.duration_minutes).toBe(75);
  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Escape');
  expect(patches.length).toBe(1);
  await task.focus();
  await page.keyboard.press('Space');
  for (let day = 0; day < 5; day++) await page.keyboard.press('ArrowRight');
  for (let step = 0; step < 30; step++) await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter');
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]?.start_date).toBe('2026-10-25T00:30:00.000Z');
  await page.goto('/calendar/day?date=2026-10-25');
  await expect(page.locator('.hour-gutter > span')).toHaveCount(25);
  await expect(page.locator('.hour-gutter')).toContainText('02:00 CEST');
  await expect(page.locator('.hour-gutter')).toContainText('02:00 CET');
  await page.locator('.hour-board').evaluate((node) => {
    node.scrollTop = 0;
  });
  await page.screenshot({ path: '/tmp/ttd-drag-dst.png' });
});
test('75.5 resize handle, all-day conversion and return to hours', async ({ page }) => {
  const patches = await fixture(page);
  await page.goto('/calendar/week?date=2026-10-20');
  const handle = page.locator('[data-calendar-task="drag-task"] [data-calendar-resize]');
  const box = await handle.boundingBox();
  if (!box) throw new Error('Missing handle');
  const end = await point(page, '2026-10-20', 690);
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]?.duration_minutes).toBe(90);
  const task = page.locator('[data-calendar-task="drag-task"]');
  const source = await task.boundingBox();
  const target = await page.locator('.hour-allday-cell[data-day="2026-10-22"]').boundingBox();
  if (!source || !target) throw new Error('Missing all-day target');
  await page.mouse.move(source.x + 30, source.y + 4);
  await page.mouse.down();
  await page.mouse.move(target.x + 30, target.y + 4, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toMatchObject({ is_all_day: true, start_date: null, duration_minutes: null });
  await expect(page.locator('.hour-allday [data-calendar-task]')).toHaveCount(1);
  await dragTo(page, '2026-10-23', 600);
  await expect.poll(() => patches.length).toBe(3);
  expect(patches[2]).toMatchObject({
    is_all_day: false,
    duration_minutes: 60,
    start_date: '2026-10-23T08:00:00.000Z',
  });
});
test('75.5 month drag preserves clock, failed save rolls back and retries', async ({ page }) => {
  const patches = await fixture(page, true);
  await page.goto('/calendar/month?date=2026-10-20');
  const task = page.locator('[data-calendar-task="drag-task"]');
  await task.focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert')).toContainText('No se ha podido mover');
  await expect(page.locator('[data-day="2026-10-20"] [data-calendar-task]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
  await expect.poll(() => patches.length).toBe(2);
  expect(patches[1]).toMatchObject({
    start_date: '2026-10-21T08:00:00.000Z',
    due_date: '2026-10-21T09:00:00.000Z',
  });
});
test.describe('Touch', () => {
  test.use({ hasTouch: true });
  test('75.5 touch hold moves a task and external events stay read-only', async ({ page }) => {
    const patches = await fixture(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/calendar/day?date=2026-10-20');
    const task = page.locator('[data-calendar-task="drag-task"]');
    const box = await task.boundingBox();
    if (!box) throw new Error('Missing touch task');
    const target = await point(page, '2026-10-20', 660);
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: box.x + 60, y: box.y + 4 }],
    });
    await page.waitForTimeout(450);
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: target.x, y: target.y + 4 }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => patches.length).toBe(1);
    expect(patches[0]?.start_date).toBe('2026-10-20T09:00:00.000Z');
    const handle = await page.locator('[data-calendar-resize]').boundingBox();
    const finish = await point(page, '2026-10-20', 750);
    if (!handle) throw new Error('Missing touch resize handle');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: handle.x + handle.width / 2, y: handle.y + 2 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: finish.x, y: finish.y }],
    });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await expect.poll(() => patches.length).toBe(2);
    expect(patches[1]?.duration_minutes).toBe(90);

    await page.goto('/calendar/day?date=2026-10-21');
    const external = page.getByRole('button', { name: 'Evento externo', exact: true });
    const ext = await external.boundingBox();
    if (!ext) throw new Error('Missing external event');
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: ext.x + 40, y: ext.y + 4 }],
    });
    await page.waitForTimeout(450);
    await expect(page.getByRole('status').filter({ hasText: 'calendario de origen' })).toHaveCount(
      1,
    );
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    expect(patches.length).toBe(2);
  });
});

test('75.5 Alt precision, outside cancellation and edge auto-scroll', async ({ page }) => {
  const patches = await fixture(page);
  await page.goto('/calendar/day?date=2026-10-20');
  await expect(page.locator('[data-calendar-task]')).toBeVisible();
  await page.keyboard.down('Alt');
  await dragTo(page, '2026-10-20', 620);
  await page.keyboard.up('Alt');
  await expect.poll(() => patches.length).toBe(1);
  expect(patches[0]?.start_date).toBe('2026-10-20T08:20:00.000Z');
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible();
  let box = await page.locator('[data-calendar-task]').boundingBox();
  if (!box) throw new Error('Missing task');
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(10, 10, { steps: 3 });
  await page.mouse.up();
  expect(patches.length).toBe(1);
  box = await page.locator('[data-calendar-task]').boundingBox();
  const board = await page.locator('.hour-board').boundingBox();
  if (!box || !board) throw new Error('Missing scroll target');
  const before = await page.locator('.hour-board').evaluate((node) => node.scrollTop);
  await page.mouse.move(box.x + box.width / 2, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, board.y + board.height - 8, { steps: 3 });
  await expect
    .poll(() => page.locator('.hour-board').evaluate((node) => node.scrollTop))
    .toBeGreaterThan(before);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  expect(patches.length).toBe(1);
});

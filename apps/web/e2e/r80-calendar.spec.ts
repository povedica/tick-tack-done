import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
const within = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1);
test('TTD-AUD-87 day header, title and lanes', async ({page}, info) => {
  await r80Fixture(page); await page.goto('/calendar/day?date=2026-10-22');
  const mobile = info.project.name.startsWith('mobile');
  const strip = page.locator('.calendar-day-week-strip');
  if (mobile) {
    await expect(strip).toBeVisible(); within((await strip.boundingBox())?.height ?? 0,48);
    await strip.getByRole('button').first().click(); await expect(page).toHaveURL(/date=2026-10-19/);
  } else {
    await expect(strip).toHaveCount(0);
    const head = page.locator('.hour-headers'); await expect(head).toBeVisible(); within((await head.boundingBox())?.height ?? 0,44);
    await expect(page.locator('.calendar-toolbar')).toContainText('22 de octubre de 2026');
    const task=page.locator('.calendar-hour-task').first();
    const event=page.locator('.hour-col button.hour-block').filter({hasText:'Evento simultáneo'});
    await expect(task).toBeAttached(); await expect(event).toBeAttached();
    const a=await task.boundingBox();const b=await event.boundingBox();const column=await task.locator('..').boundingBox();
    within(a?.width ?? 0, ((column?.width ?? 0)-2)/2);within(b?.width ?? 0,((column?.width ?? 0)-2)/2);
    within((b?.x ?? 0)-(a?.x ?? 0)-(a?.width ?? 0),2);
  }
});
test('TTD-AUD-88 two weeks fills the content height', async ({page}, info) => {
  await r80Fixture(page, {count:6}); await page.goto('/calendar/two-weeks?date=2026-10-22');
  await expect(page.locator('.calendar-two-weeks')).toBeVisible();
  const grid = await page.locator('.cal-month').boundingBox(); const area = await page.locator('.outlet').boundingBox();
  expect(Math.abs((area?.y ?? 0)+(area?.height ?? 0)-(grid?.y ?? 0)-(grid?.height ?? 0))).toBeLessThanOrEqual(info.project.name.startsWith('mobile') ? 16 : 8);
  if (info.project.name.startsWith('desktop')) expect((await page.locator('.cal-cell').first().boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(299);
});

test('TTD-AUD-87: many simultaneous events retain readable lanes and expose +N', async({page})=>{
 await r80Fixture(page);
 await page.route('**/api/v1/calendar/events**',route=>route.fulfill({json:{tasks:[],external:Array.from({length:24},(_,index)=>({id:`many-${index}`,title:`Overlap ${index}`,subscription_id:'cal',provider:'google',starts_at:'2026-10-22T08:00:00Z',ends_at:'2026-10-22T09:00:00Z',is_all_day:false,time_zone:'Europe/Madrid'}))}}));
 await page.goto('/calendar/day?date=2026-10-22');
 const overflow=page.locator('.hour-overflow');await expect(overflow).toBeVisible();
 for(const box of await page.locator('.hour-col .hour-block').evaluateAll(nodes=>nodes.map(node=>node.getBoundingClientRect().width))) expect(box).toBeGreaterThanOrEqual(63);
 await overflow.click();await expect(page.locator('.calendar-day-sheet')).toBeVisible();
});
test('TTD-AUD-88: six tasks respect the cell limit and +N opens the day',async({page})=>{
 await r80Fixture(page,{count:6});await page.goto('/calendar/two-weeks?date=2026-10-22');
 // The two-week cell has five visible task slots, further bounded by available height.
 const overflow=page.locator('.cal-cell[data-day="2026-10-22"] .calendar-overflow');
 await expect(overflow).toBeVisible();await overflow.click();await expect(page.locator('.calendar-day-sheet')).toBeVisible();
});

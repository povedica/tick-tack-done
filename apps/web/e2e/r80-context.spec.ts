import {expect,test} from '@playwright/test';
import {r80Fixture} from './r80.fixture';
for(const entry of ['keyboard','rail','bottom']) test(`TTD-AUD-92 ${entry} inherits today`, async({page},info)=>{
  test.skip(entry==='rail' && info.project.name.startsWith('mobile'));
  test.skip(entry==='bottom' && info.project.name.startsWith('desktop'));
  await r80Fixture(page);await page.goto('/today');
  if(entry==='keyboard') await page.keyboard.press('n');
  else await page.locator(entry==='rail'?'.icon-rail button[aria-keyshortcuts=N]':'.bottom-bar .fab-slot').click();
  const dialog=page.locator('[role=dialog].calendar-quick-add');await expect(dialog).toBeVisible();
  await expect(dialog.locator('.composer-date')).toContainText('Hoy');
  await expect(page.locator('[role=dialog].calendar-quick-add')).toHaveCount(1);
});
test('TTD-AUD-92 inherits a list',async({page})=>{
  await r80Fixture(page);await page.goto('/list/list');await page.keyboard.press('n');
  await expect(page.locator('[role=dialog].calendar-quick-add')).toContainText('Lista sintética');
});

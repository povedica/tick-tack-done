import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
for (const origin of ['composer', 'detail']) test(`TTD-AUD-90 ${origin} date remains inside visual viewport`, async ({page}, info) => {
  await r80Fixture(page); await page.goto(origin === 'detail' ? '/today?task=task' : '/today');
  if(origin === 'composer') { await page.keyboard.press('n'); await page.locator('[role=dialog] .composer-date').click(); }
  else await page.locator('.detail-meta-chip').first().click();
  const sheet=page.locator('.date-popover'); await expect(sheet).toBeVisible();
  let box = await sheet.boundingBox(); expect(box).not.toBeNull();
  if(info.project.name.startsWith('mobile')) {
    expect(Math.abs(box?.x ?? -9)).toBeLessThanOrEqual(1); expect(Math.abs((box?.width ?? 0)-390)).toBeLessThanOrEqual(1);
    expect(Math.abs((box?.y ?? 0)+(box?.height ?? 0)-844)).toBeLessThanOrEqual(1);
    await page.evaluate(() => { Object.defineProperty(window.visualViewport,'height',{configurable:true,value:500}); window.visualViewport?.dispatchEvent(new Event('resize')); });
    await expect.poll(async () => {box=await sheet.boundingBox(); return (box?.y ?? 0)+(box?.height ?? 0);}).toBeLessThanOrEqual(501);
  } else {
    expect(box?.x ?? -1).toBeGreaterThanOrEqual(0); expect((box?.x??0)+(box?.width??0)).toBeLessThanOrEqual(1280);
    expect((box?.y??0)+(box?.height??0)).toBeLessThanOrEqual(800);
  }
  await page.keyboard.press('Escape'); await expect(sheet).toHaveCount(0);
});

for(const corner of ['top-left','top-right','bottom-left','bottom-right']) test(`TTD-AUD-90 desktop anchor ${corner} stays inside viewport`,async({page},info)=>{
 test.skip(info.project.name.startsWith('mobile'));
 await r80Fixture(page);await page.goto('/today?task=task');
 const anchor=page.locator('.detail-meta-chip').first();await expect(anchor).toBeVisible();
 await anchor.evaluate((node,corner)=>{node.style.position='fixed';node.style.zIndex='1000';node.style.left=corner.endsWith('left')?'0':'auto';node.style.right=corner.endsWith('right')?'0':'auto';node.style.top=corner.startsWith('top')?'0':'auto';node.style.bottom=corner.startsWith('bottom')?'0':'auto';},corner);
 await anchor.click();const sheet=page.locator('.date-popover');await expect(sheet).toBeVisible();
 const box=await sheet.boundingBox();expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(1280);expect(box!.y+box!.height).toBeLessThanOrEqual(800);
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);await expect(anchor).toBeFocused();
});

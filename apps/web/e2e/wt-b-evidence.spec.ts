import { test } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import { wtBFixture, openBoard } from './wt-b.fixture';

test('TTD-AUD-109/108/110/128: evidence', async ({ page }, info) => {
  test.skip(!info.project.name.startsWith('wt-b'));
  await wtBFixture(page);
  await openBoard(page);
  const phase = process.env.WT_B_BEFORE === '1' ? 'antes' : 'despues';
  const width = info.project.use.viewport!.width;
  const theme = info.project.name.endsWith('dark') ? 'dark' : 'light';
  const dir = '../../test-artifacts/audit/evidencias/wt-b';
  await mkdir(dir, { recursive: true });
  for (const id of ['109', '108', '110', '128'])
    await page.screenshot({ path: `${dir}/${id}_lista-kanban_${phase}_${width}_${theme}.png` });
  await page.goto('/list/list?view=list');
  await page.locator('.task-row').first().waitFor();
  await page.screenshot({ path: `${dir}/128_lista_${phase}_${width}_${theme}.png` });
  await page.goto('/today?view=kanban&group=priority');
  await page.locator('.task-group').first().waitFor();
  await page.screenshot({ path: `${dir}/108_hoy_${phase}_${width}_${theme}.png` });
});

import { expect, test } from '@playwright/test';
import { r80Fixture } from './r80.fixture';
test('TTD-AUD-99 disconnected Drive disables attaching and explains how to connect', async ({
  page,
}) => {
  await r80Fixture(page);
  await page.goto('/today?task=task');
  const input = page.locator('.detail-attach-btn input[type=file]');
  await expect(input).toBeDisabled();
  await expect(page.locator('.detail-attach-btn')).toHaveAttribute(
    'title',
    'Para adjuntar ficheros, conecta Google Drive',
  );
  await expect(page.getByRole('link', { name: 'Conectar Google Drive' })).toHaveAttribute(
    'href',
    '/settings/integrations',
  );
});
test('TTD-AUD-99 Drive chips have token heights and removal defaults to keeping the file', async ({
  page,
}, info) => {
  await r80Fixture(page, { drive: true });
  await page.goto('/today?task=task');
  const chip = page.locator('.attachment-chip');
  await expect(chip).toBeVisible();
  expect(
    Math.abs(
      ((await chip.boundingBox())?.height ?? 0) -
        (info.project.name.startsWith('mobile') ? 32 : 24),
    ),
  ).toBeLessThanOrEqual(1);
  await expect(chip).toHaveAttribute('target', '_blank');
  await expect(chip).toHaveAttribute('href', /^https:\/\/drive\.google\.com\//);
  await page.locator('.asset-remove').click();
  const dialog = page.getByRole('dialog', { name: 'Quitar de la tarea' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('checkbox')).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Cancelar' }).click();
  await expect(chip).toBeVisible();
});
test('TTD-AUD-99 web binary goes only to Drive while ttd receives small metadata requests', async ({
  page,
}) => {
  await r80Fixture(page, { drive: true });
  const metadata: { path: string; bytes: number }[] = [];
  let uploaded = false;
  await page.route('**/attachments/drive-session', (route) => {
    metadata.push({ path: 'session', bytes: route.request().postDataBuffer()?.length ?? 0 });
    return route.fulfill({
      json: {
        upload_url: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=browser-test',
        upload_id: 'signed',
      },
    });
  });
  await page.route(
    'https://www.googleapis.com/upload/drive/v3/files?upload_id=browser-test',
    (route) => {
      uploaded = true;
      return route.fulfill({ json: { id: 'uploaded-file' } });
    },
  );
  await page.route('**/attachments/drive-complete', (route) => {
    metadata.push({ path: 'complete', bytes: route.request().postDataBuffer()?.length ?? 0 });
    return route.fulfill({ json: { id: 'attachment' } });
  });
  await page.goto('/today?task=task');
  await page.locator('.detail-attach-btn input[type=file]').setInputFiles({
    name: 'web.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Direct browser to Drive'),
  });
  await expect.poll(() => uploaded).toBe(true);
  await expect.poll(() => metadata.length).toBe(2);
  expect(metadata.every((item) => item.bytes < 4096)).toBe(true);
});

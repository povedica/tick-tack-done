import { expect, test } from '@playwright/test';

test.skip(
  process.env.TICKY_CROSS_BROWSER_WS === undefined,
  'Requires isolated real NestJS and Python services',
);
for (const viewport of [
  { width: 1280, height: 900 },
  { width: 390, height: 844 },
]) {
  test(`APP-06 / TK-610: real deterministic chat at ${String(viewport.width)}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/ticky');
    await page.getByText('Permisos y preferencias', { exact: true }).click();
    await page.getByLabel('Inicio de jornada').fill('09:00');
    await page.getByLabel('Fin de jornada').fill('17:00');
    await page.getByLabel('Preparar y editar rutinas sin avisos').check();
    await Promise.all([
      page.waitForResponse(
        (response) =>
          response.url().endsWith('/api/v1/ticky/authority') &&
          response.request().method() === 'PATCH' &&
          response.status() === 200,
      ),
      page.getByRole('button', { name: 'Guardar permisos' }).click(),
    ]);
    await page.reload();
    await page.getByText('Permisos y preferencias', { exact: true }).click();
    await expect(page.getByLabel('Inicio de jornada')).toHaveValue('09:00');
    await expect(page.getByLabel('Fin de jornada')).toHaveValue('17:00');
    await expect(page.getByLabel('Preparar y editar rutinas sin avisos')).toBeChecked();
    await page.getByText('Permisos y preferencias', { exact: true }).click();
    if (viewport.width === 1280) {
      const routineForm = page.locator('.ticky-routine-form');
      await expect(routineForm).toBeVisible();
      await page.getByLabel('Hora local').fill('08:30');
      await page.getByLabel('Zona horaria IANA').fill('Europe/Madrid');
      await page.getByLabel('Permitir preparación automática en modo shadow').check();
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().endsWith('/api/v1/ticky/routines') &&
            response.request().method() === 'POST' &&
            response.status() === 201,
        ),
        routineForm.getByRole('button', { name: 'Guardar', exact: true }).click(),
      ]);
      const routineCard = page.locator('.ticky-routine').filter({ hasText: '08:30' });
      await expect(routineCard).toContainText('Modo shadow');
      await routineCard.getByRole('button', { name: 'Editar' }).click();
      await page.getByLabel('Hora local').fill('08:45');
      await Promise.all([
        page.waitForResponse(
          (response) =>
            response.url().includes('/api/v1/ticky/routines/') &&
            response.request().method() === 'PUT' &&
            response.status() === 200,
        ),
        routineForm.getByRole('button', { name: 'Guardar', exact: true }).click(),
      ]);
      const updatedCard = page.locator('.ticky-routine').filter({ hasText: '08:45' });
      await updatedCard.getByRole('button', { name: 'Pausar' }).click();
      await expect(updatedCard).toContainText('Pausada');
    }
    const input = page.locator('#ticky-input');
    await expect(input).toBeVisible();
    await input.fill('Qué tengo hoy');
    await input.press('Tab');
    await page.locator('.ticky-composer button[type=submit]').click();
    await expect(page.locator('.ticky-log')).toContainText('Synthetic HTTP task', {
      timeout: 20_000,
    });
    await page.reload();
    await expect(page.locator('.ticky-log')).toContainText('Synthetic HTTP task');
    await page
      .locator('#ticky-input')
      .fill(
        `Captura:\n- UI chosen ${String(viewport.width)}\n- UI omitted ${String(viewport.width)}`,
      );
    await page.locator('.ticky-composer button[type=submit]').click();
    const proposal = page.getByRole('region', { name: 'Revisión de propuesta' }).last();
    await expect(proposal).toContainText(`UI chosen ${String(viewport.width)}`);
    await expect(proposal.getByRole('checkbox').first()).not.toBeChecked();
    await proposal.getByRole('checkbox').first().check();
    await proposal.getByRole('button', { name: 'Aprobar seleccionados' }).click();
    await expect(proposal).toContainText('Cambios confirmados: 1 de 1');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await page.screenshot({
      path: `test-results/ticky-cross-${String(viewport.width)}.png`,
      fullPage: true,
    });
  });
}

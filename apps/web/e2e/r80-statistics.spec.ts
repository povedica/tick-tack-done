import path from 'node:path';
import { expect, test } from '@playwright/test';
import { statisticsFixture } from './statistics.fixture';
import { r80Fixture } from './r80.fixture';

for (const screen of ['estadisticas', 'reporte-actual', 'reporte-anterior'])
  test(`TTD-AUD-95: ${screen}`, async ({ page }, info) => {
    await r80Fixture(page);
    const daily = Array.from({ length: 7 }, (_, i) => ({
      date: `2026-10-${19 + i}`,
      completed: i < 4 ? i + 1 : 0,
      created: i < 4 ? 3 : 0,
    }));
    await page.route('**/api/v1/stats/**', async (route) => {
      const kind = new URL(route.request().url()).pathname.split('/').at(-1)!;
      const data = statisticsFixture(false);
      data.overview.summary = {
        ...data.overview.summary,
        completed: 126,
        completed_previous: 120,
        completed_delta_percent: 5,
        completion_completed: 16,
        completion_planned: 24,
        completion_rate: 66.7,
      };
      data.overview.daily = daily.map((day) => ({ ...data.overview.daily[0]!, ...day }));
      await route.fulfill({ json: data[kind as keyof typeof data] ?? {} });
    });
    await page.route('**/api/v1/reports/weekly', async (route) =>
      route.fulfill({
        json: {
          items: [
            { week: '2026-10-19', payload: { time_zone: 'Europe/Madrid', completed: 126 } },
            {
              week: '2026-10-12',
              payload: {
                time_zone: 'Europe/Madrid',
                days: daily.map((day, i) => ({
                  ...day,
                  date: `2026-10-${12 + i}`,
                  completed: 2,
                  created: 1,
                })),
                metrics_version: 2,
              },
            },
          ],
        },
      }),
    );
    await page.goto(
      screen === 'estadisticas'
        ? '/statistics'
        : `/reports/weekly/${screen === 'reporte-actual' ? '2026-10-19' : '2026-10-12'}`,
    );
    await expect(
      page.locator(screen === 'estadisticas' ? '.stats-kpi-grid' : '.week-balance'),
    ).toBeVisible();
    await page.evaluate(
      (theme) => (document.documentElement.dataset.theme = theme),
      info.project.name.endsWith('dark') ? 'dark' : 'light',
    );
    await page.screenshot({
      path: path.resolve(
        '../../docs/audit/evidencias/r80',
        `95_${screen}_${process.env.R80_PHASE ?? 'antes'}_${info.project.name.replace('-', '_')}.png`,
      ),
      animations: 'disabled',
    });
    if (screen === 'estadisticas') {
      await expect(
        page.locator('.stats-kpi-grid').getByText('Completadas (todas)', { exact: true }),
      ).toBeVisible();
      await expect(page.getByText('16 de 24 con fecha (67 %)', { exact: true })).toBeVisible();
      const help = page.getByLabel('Cómo se calcula el cumplimiento');
      await expect(help).toHaveAttribute('title', /canceladas/);
      const box = await help.boundingBox();
      expect(Math.abs(box!.width - 14)).toBeLessThanOrEqual(1);
    } else {
      await expect(page.locator('.week-day')).toHaveCount(7);
      await expect(page.getByText('Sin detalle diario verificable para esta semana.')).toHaveCount(
        0,
      );
      if (screen === 'reporte-actual')
        await expect(page.locator('.week-status')).toContainText('hasta hoy');
      else await expect(page.locator('.week-balance')).toContainText('14 tareas completadas');
    }
  });

import { defineConfig } from '@playwright/test';
export default defineConfig({
  workers: 1,
  testDir: './e2e',
  testMatch: 'wt-c-*.spec.ts',
  timeout: 30_000,
  projects: [360, 390, 768, 1280].flatMap((width) =>
    (['light', 'dark'] as const).map((theme) => ({
      name: `wt-c-${width}-${theme}`,
      use: {
        viewport: {
          width,
          height: width === 360 ? 780 : width === 390 ? 844 : width === 768 ? 1024 : 800,
        },
        deviceScaleFactor: 1,
        colorScheme: theme,
      },
    })),
  ),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4193',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec vite --host 127.0.0.1 --port 4193',
        url: 'http://127.0.0.1:4193/today',
        reuseExistingServer: true,
      },
});

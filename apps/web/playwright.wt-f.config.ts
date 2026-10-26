import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: 'wt-f-*.spec.ts',
  workers: 1,
  timeout: 30_000,
  projects: ['light', 'dark'].flatMap((theme) =>
    [360, 390, 768, 1280].map((width) => ({
      name: `wt-f-${width}-${theme}`,
      use: {
        viewport: {
          width,
          height: width === 360 ? 780 : width === 390 ? 844 : width === 768 ? 1024 : 800,
        },
        hasTouch: width <= 768,
        colorScheme: theme as 'light' | 'dark',
      },
    })),
  ),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4196',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: 'pnpm exec vite --host 127.0.0.1 --port 4196',
        url: 'http://127.0.0.1:4196/today',
        reuseExistingServer: true,
      },
});

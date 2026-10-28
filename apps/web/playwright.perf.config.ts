import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4174';

export default defineConfig({
  testDir: './e2e/perf',
  testMatch: 'calendar.perf.spec.ts',
  timeout: 45 * 60_000,
  workers: 1,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL,
    ignoreHTTPSErrors: true,
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'perf',
      use: {
        ...devices['Pixel 7'],
        locale: 'es-ES',
        timezoneId: 'Europe/Madrid',
        // 35k events blow Chromium's default 64 MB /dev/shm inside Docker.
        launchOptions: { args: ['--disable-dev-shm-usage'] },
      },
    },
  ],
});

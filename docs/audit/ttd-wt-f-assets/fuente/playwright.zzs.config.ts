import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'zz-plan-simple.spec.ts',
  timeout: 120_000,
  workers: 1,
  projects: [
    {
      name: 'desktop',
      use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2, colorScheme: 'light' },
    },
    {
      name: 'mobile',
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: 'light',
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  use: {
    baseURL: 'http://127.0.0.1:4181',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'off',
    launchOptions: {
      executablePath: '/opt/google/chrome/chrome',
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    },
  },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 4181',
    url: 'http://127.0.0.1:4181/today',
    reuseExistingServer: true,
  },
});

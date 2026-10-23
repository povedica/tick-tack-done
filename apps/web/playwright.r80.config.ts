import { defineConfig } from '@playwright/test';
const preview = process.env.R80_PREVIEW === '1';
const port = preview ? 4182 : 4181;
export default defineConfig({
  testDir: './e2e',
  testMatch: '*.spec.ts',
  timeout: 30_000,
  projects: ['light', 'dark'].flatMap((theme) => [
    {
      name: `desktop-${theme}`,
      use: {
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 2,
        colorScheme: theme as 'light' | 'dark',
      },
    },
    {
      name: `mobile-${theme}`,
      use: {
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        colorScheme: theme as 'light' | 'dark',
      },
    },
  ]),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${port}`,
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: preview
          ? 'pnpm exec vite preview --host 127.0.0.1 --port 4182'
          : 'pnpm exec vite --host 127.0.0.1 --port 4181',
        url: `http://127.0.0.1:${port}/today`,
        reuseExistingServer: true,
      },
});

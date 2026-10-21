import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
  },
  ...(process.env.PLAYWRIGHT_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173/today',
          reuseExistingServer: true,
        },
      }),
});

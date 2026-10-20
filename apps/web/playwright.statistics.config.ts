import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'statistics.spec.ts',
  timeout: 30000,
  workers: 2,
  use: {
    baseURL: process.env.STATISTICS_BASE_URL ?? 'http://127.0.0.1:4173',
    ...devices['Desktop Chrome'],
  },
  ...(process.env.STATISTICS_BASE_URL
    ? {}
    : {
        webServer: {
          command: 'pnpm exec vite --host 127.0.0.1 --port 4173',
          url: 'http://127.0.0.1:4173/today',
          reuseExistingServer: true,
        },
      }),
});

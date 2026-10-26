import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e',
  testMatch: 'habits-design.spec.ts',
  workers: 1,
  timeout: 30000,
  projects: [375, 1280].flatMap((width) =>
    ['light', 'dark'].map((theme) => ({
      name: `habits-${width}-${theme}`,
      use: {
        viewport: { width, height: width === 375 ? 667 : 800 },
        colorScheme: theme as 'light' | 'dark',
      },
    })),
  ),
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5190',
    locale: 'es-ES',
    timezoneId: 'Europe/Madrid',
    trace: 'retain-on-failure',
  },
});

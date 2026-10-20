import { defineConfig } from '@playwright/test';
const endpoint = process.env.TICKY_CROSS_BROWSER_WS;
if (endpoint === undefined) {
  throw new Error('An isolated cross-repository browser server is required');
}
export default defineConfig({
  testDir: './e2e',
  testMatch: 'ticky-cross.spec.ts',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL: 'http://localhost:4173',
    connectOptions: { wsEndpoint: endpoint, exposeNetwork: '<loopback>' },
  },
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --host 0.0.0.0 --port 4173',
    url: 'http://127.0.0.1:4173/ticky',
    reuseExistingServer: false,
    timeout: 60_000,
  },
});

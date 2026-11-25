import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.{ts,tsx}', 'scripts/**/*.spec.ts'],
    setupFiles: ['src/test-setup.ts'],
  },
});

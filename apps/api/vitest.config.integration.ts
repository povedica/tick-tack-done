import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@reflexionia/domain': path.resolve(__dirname, '../../packages/domain/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['test/**/*.e2e-spec.ts'],
    passWithNoTests: true,
    fileParallelism: false,
    hookTimeout: 30_000,
  },
});

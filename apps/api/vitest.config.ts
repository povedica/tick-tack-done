import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@reflexionia/domain': path.resolve(
        import.meta.dirname,
        '../../packages/domain/src/index.ts',
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    passWithNoTests: true,
  },
});

import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: {
    include: ['packages/**/*.test.ts', 'apps/mobile/tests/**/*.test.ts'],
    fileParallelism: false,
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text'],
      // Part A promises ≥ 90 % in domain unit tests: do not let that slip unnoticed.
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});

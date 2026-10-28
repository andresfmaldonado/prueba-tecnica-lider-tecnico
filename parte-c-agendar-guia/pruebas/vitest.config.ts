import { defineConfig } from 'vitest/config';

// The functional, load, stress and security campaigns live apart from `npm test`
// (which only picks up *.test.ts) so the single command stays fast.
export default defineConfig({
  test: {
    include: ['pruebas/**/*.campaign.ts'],
    testTimeout: 900_000,
    hookTimeout: 900_000,
    // One file at a time: load and stress tests measure timings and must not compete with each other.
    fileParallelism: false,
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text', 'html'],
      reportsDirectory: 'pruebas/funcional/resultados/cobertura',
    },
  },
});

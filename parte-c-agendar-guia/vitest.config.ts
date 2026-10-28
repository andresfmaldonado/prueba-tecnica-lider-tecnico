import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts'],
      reporter: ['text'],
      // La Parte A promete ≥ 90 % en unitarias de dominio: que no se pierda sin que nadie lo note.
      thresholds: { statements: 90, branches: 90, functions: 90, lines: 90 },
    },
  },
});

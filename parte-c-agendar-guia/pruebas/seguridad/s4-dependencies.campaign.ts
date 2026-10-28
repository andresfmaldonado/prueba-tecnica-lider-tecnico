import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from './util';

/**
 * S4 · Vulnerable components (OWASP A06). The vulnerabilities part (npm audit) and the
 * dependency tree (npm ls) is run by command and saved to resultados/. Here we check the
 * dependency structure: the library must not pull in production dependencies.
 */
const pkg = JSON.parse(readFileSync(resolve(PROJECT_ROOT, 'package.json'), 'utf8')) as Record<string, unknown>;

describe('S4 · Dependencias', () => {
  it('package.json no declara dependencias de producción (solo devDependencies)', () => {
    expect(pkg).not.toHaveProperty('dependencies');
    expect(pkg).toHaveProperty('devDependencies');
    console.log(`[MEDIDA] devDependencies: ${Object.keys(pkg.devDependencies as object).join(', ')}`);
  });

  it('package-lock.json existe y fija versiones', () => {
    const lock = resolve(PROJECT_ROOT, 'package-lock.json');
    expect(existsSync(lock)).toBe(true);
    const content = JSON.parse(readFileSync(lock, 'utf8')) as { lockfileVersion?: number };
    expect(content.lockfileVersion).toBeGreaterThanOrEqual(2);
  });

  it('el paquete es privado (no se publica por accidente)', () => {
    expect(pkg.private).toBe(true);
  });
});

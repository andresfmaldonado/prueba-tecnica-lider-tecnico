import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from './util';

/**
 * S6 · Dangerous patterns in src/ (static analysis, OWASP A03/A08).
 * The library must not run dynamic code, open network connections, touch the file system,
 * log to the console, and read the environment only in the settings adapter
 * (src/adapters/settings-from-env.ts). Expected: no matches.
 */
const PATTERNS: [string, RegExp][] = [
  ['eval', /\beval\s*\(/],
  ['new Function', /\bnew\s+Function\b/],
  ['child_process', /child_process/],
  ['require(', /\brequire\s*\(/],
  ['import(', /\bimport\s*\(/],
  ['fs', /\bfs\b/],
  ['net', /\bnet\b/],
  ['http', /\bhttp\b/],
  ['https', /\bhttps\b/],
  ['process.env', /process\.env/],
  ['Math.random', /Math\.random/],
  ['console.log', /console\.log/],
  ['Buffer', /\bBuffer\b/],
];

// The single file allowed to read the environment (configuration adapter).
const ENVIRONMENT_ADAPTER = 'settings-from-env.ts';

function srcFiles(): string[] {
  const dir = resolve(PROJECT_ROOT, 'src');
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => resolve(dir, f));
}

describe('S6 · Patrones peligrosos en src/', () => {
  const files = srcFiles();
  it('se analizan los archivos de src/ (no vacío)', () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
    console.log(`[MEDIDA] archivos analizados en src/: ${files.length}`);
  });

  it.each(PATTERNS)('patrón %s: ninguna coincidencia', (_name, rx) => {
    const matches: string[] = [];
    for (const route of files) {
      if (_name === 'process.env' && route.endsWith(ENVIRONMENT_ADAPTER)) continue;
      readFileSync(route, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (rx.test(line)) matches.push(`${route.replace(PROJECT_ROOT, '')}:${i + 1}: ${line.trim()}`);
        });
    }
    for (const c of matches) console.log(`[COINCIDENCIA] ${c}`);
    expect(matches).toEqual([]);
  });
});

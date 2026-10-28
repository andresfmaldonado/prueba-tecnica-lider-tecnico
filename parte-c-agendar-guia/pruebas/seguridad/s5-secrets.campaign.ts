import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PROJECT_ROOT } from './util';

/**
 * S5 · Secrets in the repository (OWASP A02/A05, complements A07 and credential hygiene).
 * Runs our own scanner over the full repository. Findings within
 * parte-c-agendar-guia must be 0. A canary checks that the scanner does detect.
 */
const SCANNER = resolve(PROJECT_ROOT, 'pruebas/seguridad/escaner-secretos.py');
const REPO = resolve(PROJECT_ROOT, '..');
const RESULTS = resolve(PROJECT_ROOT, 'pruebas/seguridad/resultados');
const CANARY = resolve(RESULTS, 'canario-escaner');

interface Report {
  archivos_escaneados: number;
  hallazgos: { archivo: string; linea: number; patron: string; valor: string }[];
  falsos_positivos_documentados: { archivo: string; linea: number; patron: string }[];
}

function scan(root: string, output: string): Report {
  const r = spawnSync('python3', [SCANNER, '--raiz', root, '--salida', output], { encoding: 'utf8' });
  expect(r.status, r.stderr).toBe(0);
  return JSON.parse(readFileSync(output, 'utf8')) as Report;
}

describe('S5 · Secretos', () => {
  it('el canario con secretos sintéticos produce las 5 coincidencias esperadas', () => {
    rmSync(CANARY, { recursive: true, force: true });
    mkdirSync(CANARY, { recursive: true });
    // Literals split on purpose: this file must not contain real matches.
    writeFileSync(
      resolve(CANARY, 'config.txt'),
      [
        'stripe = ' + 'sk_live_' + 'abcdefghij1234',
        'aws ' + 'AKIA' + 'ABCDEFGHIJKLMNOP',
        '-----BEGIN ' + 'RSA PRIVATE KEY-----',
        'pass' + 'word = "abcdefgh1"',
        'linea sin nada',
      ].join('\n'),
    );
    writeFileSync(resolve(CANARY, '.env.local'), 'X=1\n');
    const r = scan(CANARY, resolve(RESULTS, 'canario-escaner.json'));
    rmSync(CANARY, { recursive: true, force: true });
    console.log(`[MEDIDA] canario: ${r.hallazgos.map((h) => `${h.patron}@${h.linea || 'env'}`).join(', ')}`);
    expect(r.hallazgos.map((h) => h.patron).sort()).toEqual(
      ['archivo_env', 'asignacion_secreta', 'clave_aws_akia', 'clave_privada_pem', 'clave_stripe_live'].sort(),
    );
  });

  it('repositorio completo: 0 hallazgos dentro de parte-c-agendar-guia', () => {
    const output = resolve(RESULTS, 'escaner-secretos.json');
    const r = scan(REPO, output);
    rmSync(resolve(RESULTS, 'canario-escaner.json'), { force: true });
    const inPartC = r.hallazgos.filter((h) => h.archivo.startsWith('parte-c-agendar-guia/'));
    console.log(`[MEDIDA] escaneados ${r.archivos_escaneados} archivos de texto; hallazgos totales ${r.hallazgos.length}; en parte-c ${inPartC.length}; falsos positivos documentados ${r.falsos_positivos_documentados.length}`);
    for (const h of r.hallazgos) console.log(`[HALLAZGO FUERA DE PARTE-C] ${h.archivo}:${h.linea} [${h.patron}] ${h.valor}`);
    for (const f of r.falsos_positivos_documentados) console.log(`[FALSO POSITIVO DOCUMENTADO] ${f.archivo}:${f.linea} [${f.patron}]`);
    expect(r.archivos_escaneados).toBeGreaterThan(20);
    expect(inPartC).toEqual([]);
  });

  it('parte-c-agendar-guia no tiene archivos .env* versionables', () => {
    expect(existsSync(resolve(PROJECT_ROOT, '.env'))).toBe(false);
  });
});

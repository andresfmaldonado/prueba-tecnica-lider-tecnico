import { describe, expect, it } from 'vitest';
import { City, Coverage, CivilDate, TenantId } from '../../src';
import { MON_FRI, command, scenario } from './util';

/**
 * S8 · Denial of service through data (OWASP A04 insecure design, A05 limits).
 * Extreme volumes: each operation must finish in under 2 s. Timings are measured and reported.
 */
const LIMIT_MS = 2000;

describe('S8 · Denegación de servicio por datos', () => {
  it('Cobertura con 1.000.000 de fechas no disponibles: construcción y cubre() < 2 s', () => {
    const base = CivilDate.fromISO('2000-01-01');
    const dates = Array.from({ length: 1_000_000 }, (_, i) => base.plusDays(i));
    const t0 = performance.now();
    const c = new Coverage(MON_FRI, dates);
    const t1 = performance.now();
    const covers = c.covers(CivilDate.fromISO('2026-10-29'));
    const t2 = performance.now();
    console.log(
      `[MEDIDA] S8 Cobertura 1M fechas: construccion=${(t1 - t0).toFixed(1)} ms · cubre=${(t2 - t1).toFixed(3)} ms · cubre(2026-10-29)=${covers}`,
    );
    expect(t1 - t0).toBeLessThan(LIMIT_MS);
    expect(t2 - t1).toBeLessThan(LIMIT_MS);
  });

  it('100.000 tenants distintos en un repositorio: cada operación < 2 s', async () => {
    const { useCase } = scenario();
    let maximum = 0;
    let failures = 0;
    const t0 = performance.now();
    for (let i = 0; i < 100_000; i++) {
      const a = performance.now();
      const r = await useCase.execute(command({ tenant: `cliente-${i}`, waybillNumber: `G-${i}` }));
      if (r.status !== 'SIN_COBERTURA') failures++;
      maximum = Math.max(maximum, performance.now() - a);
    }
    const total = performance.now() - t0;
    const latest = performance.now();
    await useCase.execute(command({ tenant: 'cliente-0', waybillNumber: 'G-0' }));
    const idempotent = performance.now() - latest;
    console.log(
      `[MEDIDA] S8 100.000 tenants: total=${total.toFixed(0)} ms · máximo por operación=${maximum.toFixed(2)} ms · reintento idempotente=${idempotent.toFixed(2)} ms · resultados inesperados=${failures}`,
    );
    expect(failures).toBe(0);
    expect(maximum).toBeLessThan(LIMIT_MS);
    expect(idempotent).toBeLessThan(LIMIT_MS);
  });

  it('10.000 ciudades distintas con cobertura: cada operación < 2 s', async () => {
    const { coverages, useCase } = scenario();
    const cities = Array.from({ length: 10_000 }, (_, i) => `Ciudad ${i}`);
    for (const city of cities) coverages.define(TenantId.of('banco-a'), City.of(city), new Coverage(MON_FRI));
    let maximum = 0;
    let scheduled = 0;
    const t0 = performance.now();
    for (let i = 0; i < cities.length; i++) {
      const a = performance.now();
      const r = await useCase.execute(command({ waybillNumber: `G-${i}`, city: cities[i] }));
      if (r.status === 'AGENDADA') scheduled++;
      maximum = Math.max(maximum, performance.now() - a);
    }
    const total = performance.now() - t0;
    console.log(
      `[MEDIDA] S8 10.000 ciudades: total=${total.toFixed(0)} ms · máximo por operación=${maximum.toFixed(2)} ms · agendadas=${scheduled}`,
    );
    expect(scheduled).toBe(10_000);
    expect(maximum).toBeLessThan(LIMIT_MS);
  });
});

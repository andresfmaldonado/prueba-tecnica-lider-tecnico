/**
 * Black-box functional tests, groups H–I: differential testing against the oracle (10,000 cases
 * with a fixed seed) and concurrency (simultaneous requests on the same waybill).
 * Traceability: idempotency and version = Parte A §3 Datos; idempotent and resumable batch = Parte A §6 risk 4.
 */
import { describe, expect, it } from 'vitest';
import {
  ScheduleWaybill,
  City,
  Coverage,
  VersionConflict,
  CivilDate,
  Waybill,
  InMemoryWaybillRepository,
  ATTEMPTS_ON_CONFLICT,
  WaybillNumber,
  FixedClock,
  TenantId,
} from '../../src';
import type { WaybillRepository } from '../../src';
import { CITIES, TENANTS, randomCoverage, integer, randomDateISO, generator } from '../_comun/data';
import { CoveragesWithLatency } from '../_comun/latency';
import { schedule, defineCoverage, expectedOf, world, ALL } from './helpers';

const T = TenantId.of('banco-a');
const N = WaybillNumber.of('G-1');

describe('H · Diferencial contra el oráculo', () => {
  it('H1 · 10.000 casos aleatorios (semilla 20261028): 0 discrepancias con expectedAppointment', async () => {
    const rng = generator(20261028);
    const N_USE_CASES = 10_000;
    const discrepancies: Array<Record<string, unknown>> = [];
    let scheduled = 0;
    let noCoverage = 0;

    for (let i = 0; i < N_USE_CASES; i++) {
      const today = randomDateISO(rng);
      const cov = randomCoverage(rng, today);
      const tenant = TENANTS[integer(rng, 0, TENANTS.length - 1)]!;
      const city = CITIES[integer(rng, 0, CITIES.length - 1)]!;

      const m = world(today);
      defineCoverage(m, tenant, city, cov.days, cov.unavailable);
      const obtained = await schedule(m, tenant, 'G-DIF', city);
      const expected = expectedOf(today, cov.days, cov.unavailable);

      if (expected.status === 'AGENDADA') scheduled++;
      else noCoverage++;

      if (obtained.appointmentDate !== expected.appointmentDate || obtained.status !== expected.status) {
        discrepancies.push({ useCase: i, today, tenant, city, days: cov.days, unavailable: cov.unavailable, obtained, expected });
      }
    }

    console.log(
      `[H1] casos=${N_USE_CASES} agendadas=${scheduled} sin_cobertura=${noCoverage} discrepancias=${discrepancies.length}`,
    );
    for (const d of discrepancies.slice(0, 10)) console.log('[H1] discrepancia', JSON.stringify(d));
    expect(discrepancies).toEqual([]);
  }, 600_000);
});

/** Use case with any waybill repository and Monday-to-Sunday coverage in Medellín. */
function useCaseWith(repo: WaybillRepository): ScheduleWaybill {
  const coverages = new CoveragesWithLatency();
  coverages.internal.define(T, City.of('Medellín'), new Coverage(ALL as never));
  return new ScheduleWaybill(repo, coverages, new FixedClock(CivilDate.fromISO('2026-10-27')));
}

describe('I · Concurrencia e intentos', () => {
  it('I0 · ATTEMPTS_ON_CONFLICT vale 2', () => {
    expect(ATTEMPTS_ON_CONFLICT).toBe(2);
  });

  it.each([2, 50])('I1 · %i solicitudes simultáneas sobre la misma guía: misma cita y 1 escritura real', async (n) => {
    const m = world('2026-10-27', { readMs: 5, writeMs: 5 });
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    const res = await Promise.all(Array.from({ length: n }, () => schedule(m)));
    expect(res.every((r) => r.status === 'AGENDADA' && r.appointmentDate === '2026-10-28')).toBe(true);
    expect(m.waybills.internal.writes).toBe(1);
    expect((await m.waybills.internal.find(T, N))?.version).toBe(1);
  });

  it.each([2, 50])('I2 · %i solicitudes simultáneas sin cobertura: todas SIN_COBERTURA y 1 escritura real', async (n) => {
    const m = world('2026-10-27', { readMs: 5, writeMs: 5 });
    const res = await Promise.all(Array.from({ length: n }, () => schedule(m)));
    expect(res.every((r) => r.status === 'SIN_COBERTURA' && r.appointmentDate === null)).toBe(true);
    expect(m.waybills.internal.writes).toBe(1);
  });

  it('I3 · 50 guías distintas en paralelo: cada una se escribe exactamente una vez', async () => {
    const m = world('2026-10-27', { readMs: 5, writeMs: 5 });
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    const numbers = Array.from({ length: 50 }, (_, i) => `G-${i + 1}`);
    const res = await Promise.all(numbers.map((n) => schedule(m, 'banco-a', n)));
    expect(res.every((r) => r.appointmentDate === '2026-10-28')).toBe(true);
    expect(m.waybills.internal.writes).toBe(50);
  });

  it('I4 · guardar con una versión vieja lanza VersionConflict', async () => {
    const m = world('2026-10-27');
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    const old = Waybill.pending(T, N); // originalVersion 0
    await schedule(m); // another request schedules it: the stored version becomes 1
    await expect(m.waybills.internal.save(old)).rejects.toBeInstanceOf(VersionConflict);
    expect(m.waybills.internal.writes).toBe(1);
  });

  it('I5 · si el repositorio siempre da conflicto, se reintenta exactamente ATTEMPTS_ON_CONFLICT veces', async () => {
    let reads = 0;
    let savedItems = 0;
    const repo: WaybillRepository = {
      async find() {
        reads++;
        return null;
      },
      async save() {
        savedItems++;
        throw new VersionConflict('conflicto simulado');
      },
    };
    await expect(useCaseWith(repo).execute({ tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellín' })).rejects.toBeInstanceOf(
      VersionConflict,
    );
    expect(reads).toBe(ATTEMPTS_ON_CONFLICT);
    expect(savedItems).toBe(ATTEMPTS_ON_CONFLICT);
  });

  it('I6 · un conflicto puntual se resuelve releyendo: el segundo intento agenda', async () => {
    const real = new InMemoryWaybillRepository();
    let fail = true;
    const repo: WaybillRepository = {
      find: (t, n) => real.find(t, n),
      async save(g) {
        if (fail) {
          fail = false;
          throw new VersionConflict('conflicto puntual');
        }
        return real.save(g);
      },
    };
    expect(await useCaseWith(repo).execute({ tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellín' })).toEqual({
      status: 'AGENDADA',
      appointmentDate: '2026-10-28',
    });
    expect(real.writes).toBe(1);
  });
});

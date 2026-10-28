import { describe, expect, it } from 'vitest';
import { Coverage, InvalidInput, CivilDate, Waybill, InMemoryWaybillRepository, WaybillNumber, TenantId } from '../../src';
import type { Weekday } from '../../src';
import { MON_FRI } from './util';

/**
 * S7 · Domain integrity (OWASP A04 insecure design, A08 data integrity).
 * Invariants of the Waybill aggregate and of the coverage against external mutations.
 */
describe('S7 · Integridad del dominio', () => {
  it('(a) Cobertura copia sus entradas: mutar el array original no cambia cubre()', () => {
    const days: Weekday[] = [1, 2, 3, 4, 5];
    const c = new Coverage(days);
    const saturday = CivilDate.fromISO('2026-10-31'); // Saturday
    expect(c.covers(saturday)).toBe(false);
    days.push(6);
    expect(c.covers(saturday)).toBe(false);
  });

  it('(a) Cobertura copia las fechas no disponibles: mutar el array original no reabre el día', () => {
    const closed = [CivilDate.fromISO('2026-10-29')];
    const c = new Coverage(MON_FRI, closed);
    const thursday = CivilDate.fromISO('2026-10-29');
    expect(c.covers(thursday)).toBe(false);
    closed.length = 0;
    expect(c.covers(thursday)).toBe(false);
  });

  it('(b) Guia.reconstruir rechaza AGENDADA sin fecha y fecha con estado no agendado', () => {
    const t = TenantId.of('banco-a');
    const n = WaybillNumber.of('G-1');
    expect(() => Waybill.rehydrate(t, n, 'AGENDADA', null, 1)).toThrow(InvalidInput);
    expect(() => Waybill.rehydrate(t, n, 'PENDIENTE_AGENDA', CivilDate.fromISO('2026-10-29'), 1)).toThrow(InvalidInput);
    expect(() => Waybill.rehydrate(t, n, 'SIN_COBERTURA', CivilDate.fromISO('2026-10-29'), 1)).toThrow(InvalidInput);
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('(b) Guia.reconstruir rechaza versión %s', (version) => {
    expect(() => Waybill.rehydrate(TenantId.of('banco-a'), WaybillNumber.of('G-1'), 'PENDIENTE_AGENDA', null, version)).toThrow(
      InvalidInput,
    );
  });

  it('(b) un repositorio no deja que una copia mutada altere lo persistido', async () => {
    const repo = new InMemoryWaybillRepository();
    repo.seed(Waybill.rehydrate(TenantId.of('banco-a'), WaybillNumber.of('G-1'), 'PENDIENTE_AGENDA', null, 0));
    const copy = await repo.find(TenantId.of('banco-a'), WaybillNumber.of('G-1'));
    (copy as unknown as { currentStatus: string }).currentStatus = 'AGENDADA';
    const another = await repo.find(TenantId.of('banco-a'), WaybillNumber.of('G-1'));
    expect(another?.status).toBe('PENDIENTE_AGENDA');
  });

  // (c) INFORMATIONAL: not a failure. Documents that TypeScript private/readonly does not protect at runtime.
  it('(c) [INFORMATIVO] mutar por la fuerza el agregado sí surte efecto en tiempo de ejecución', () => {
    const g = Waybill.pending(TenantId.of('banco-a'), WaybillNumber.of('G-1')) as unknown as Record<string, unknown>;
    g.currentStatus = 'AGENDADA';
    g.currentAppointmentDate = null; // breaks the invariant "only AGENDADA has an appointment date"
    g.currentVersion = -1;
    g.originalVersion = 99;
    const observed = {
      status: (g as unknown as Waybill).status,
      appointmentDate: (g as unknown as Waybill).appointmentDate,
      version: (g as unknown as Waybill).version,
      originalVersion: (g as unknown as Waybill).originalVersion,
    };
    console.log(`[INFORMATIVO S7c] tras mutar: ${JSON.stringify(observed)}`);
    expect(observed).toEqual({ status: 'AGENDADA', appointmentDate: null, version: -1, originalVersion: 99 });
  });
});

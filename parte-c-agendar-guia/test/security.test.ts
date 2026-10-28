import { describe, expect, it } from 'vitest';
import {
  ScheduleWaybill,
  City,
  Coverage,
  InMemoryCoverageRepository,
  InvalidInput,
  CivilDate,
  Waybill,
  InMemoryWaybillRepository,
  WaybillAlreadyScheduled,
  MAX_IDENTIFIER_LENGTH,
  WaybillNumber,
  FixedClock,
  TenantId,
} from '../src';

// Regression tests for the findings of the Part C security test.
const TODAY = CivilDate.fromISO('2026-10-27');

describe('Aislamiento entre tenants (hallazgo H1)', () => {
  it('«a::b» + «c» y «a» + «b::c» son guías distintas, no una sola', async () => {
    const waybills = new InMemoryWaybillRepository();
    const coverages = new InMemoryCoverageRepository();
    coverages.define(TenantId.of('a::b'), City.of('Cali'), new Coverage([1, 2, 3, 4, 5]));
    const schedule = new ScheduleWaybill(waybills, coverages, new FixedClock(TODAY));

    const withCoverage = await schedule.execute({ tenant: 'a::b', waybillNumber: 'c', city: 'Cali' });
    const noCoverage = await schedule.execute({ tenant: 'a', waybillNumber: 'b::c', city: 'Cali' });

    expect(withCoverage.status).toBe('AGENDADA');
    expect(noCoverage.status).toBe('SIN_COBERTURA');
    expect(waybills.writes).toBe(2);
  });

  it('la cobertura de «a::b» + «c» no aparece para «a» + «b::c»', async () => {
    const coverages = new InMemoryCoverageRepository();
    coverages.define(TenantId.of('a::b'), City.of('c'), new Coverage([1]));

    expect(await coverages.find(TenantId.of('a'), City.of('b::c'))).toBeNull();
  });
});

describe('Validación de identificadores (hallazgos H2, H3 y H4)', () => {
  const factories = {
    tenant: (v: string) => TenantId.of(v),
    waybillNumber: (v: string) => WaybillNumber.of(v),
    city: (v: string) => City.of(v),
  };

  it.each(Object.entries(factories))('%s: acepta el máximo y rechaza un carácter más', (_field, create) => {
    expect(() => create('x'.repeat(MAX_IDENTIFIER_LENGTH))).not.toThrow();
    expect(() => create('x'.repeat(MAX_IDENTIFIER_LENGTH + 1))).toThrow(InvalidInput);
  });

  it.each(Object.entries(factories))('%s: rechaza 1 MB sin tardar', (_field, create) => {
    const t0 = performance.now();
    expect(() => create('x'.repeat(1_048_576))).toThrow(InvalidInput);
    expect(performance.now() - t0).toBeLessThan(500);
  });

  it.each([
    ['NUL', 'a\u0000b'],
    ['salto de línea', 'a\nb'],
    ['tabulación', 'a\tb'],
    ['ESC', 'a\u001bb'],
    ['sobrescritura bidireccional', 'a‮b'],
    ['espacio de ancho cero', 'a​b'],
  ])('rechaza %s dentro del valor', (_name, value) => {
    for (const create of Object.values(factories)) expect(() => create(value)).toThrow(InvalidInput);
  });

  it('«é» compuesto y descompuesto son el mismo identificador', () => {
    expect(TenantId.of('é').value).toBe(TenantId.of('é').value);
    expect(WaybillNumber.of('é').value).toBe(WaybillNumber.of('é').value);
  });
});

describe('Rango de fechas (hallazgo H5)', () => {
  it('no se puede salir del rango soportado: nada de «+010000-01-01»', () => {
    expect(() => CivilDate.fromISO('9999-12-31').plusDays(1)).toThrow(InvalidInput);
    expect(() => CivilDate.fromISO('1900-01-01').plusDays(-1)).toThrow(InvalidInput);
    expect(() => CivilDate.fromISO('2026-10-27').plusDays(Number.NaN)).toThrow(InvalidInput);
  });

  it('los extremos del rango sí son válidos', () => {
    expect(CivilDate.fromISO('9999-12-31').toString()).toBe('9999-12-31');
    expect(CivilDate.fromISO('1900-01-01').toString()).toBe('1900-01-01');
  });
});

describe('Mensajes de error acotados (hallazgo H6)', () => {
  it('un número de guía largo no se repite completo en el mensaje', () => {
    const waybill = Waybill.pending(TenantId.of('t'), WaybillNumber.of('g'.repeat(MAX_IDENTIFIER_LENGTH)));
    waybill.schedule(TODAY.plusDays(1));

    expect(() => waybill.schedule(TODAY.plusDays(2))).toThrow(WaybillAlreadyScheduled);
    try {
      waybill.schedule(TODAY.plusDays(2));
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(200);
    }
  });

  it('una fecha inválida enorme no se repite completa en el mensaje', () => {
    try {
      CivilDate.fromISO('x'.repeat(100_000));
      expect.unreachable();
    } catch (e) {
      expect((e as Error).message.length).toBeLessThan(200);
    }
  });
});

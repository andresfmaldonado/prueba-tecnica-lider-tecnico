import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, InvalidInput, CivilDate, Waybill, WaybillAlreadyScheduled, WaybillNumber, SystemClock, TenantId } from '../src';

describe('CivilDate', () => {
  it('calcula el día de la semana ISO', () => {
    expect(CivilDate.fromISO('2026-10-26').weekday()).toBe(1); // Monday
    expect(CivilDate.fromISO('2026-11-01').weekday()).toBe(7); // Sunday
  });

  it('suma días cruzando mes y año, y años bisiestos', () => {
    expect(CivilDate.fromISO('2026-12-31').plusDays(1).toString()).toBe('2027-01-01');
    expect(CivilDate.fromISO('2028-02-28').plusDays(1).toString()).toBe('2028-02-29');
  });

  it('solo lunes a viernes son hábiles', () => {
    const monday = CivilDate.fromISO('2026-10-26');
    const businessDays = [0, 1, 2, 3, 4, 5, 6].map((d) => DEFAULT_RULES.businessDays.has(monday.plusDays(d).weekday()));
    expect(businessDays).toEqual([true, true, true, true, true, false, false]);
  });

  it.each(['2026-02-30', '2026-13-01', '26-10-27', 'mañana'])('rechaza la fecha inválida %s', (text) => {
    expect(() => CivilDate.fromISO(text)).toThrow(InvalidInput);
  });
});

describe('Guia', () => {
  const tenant = TenantId.of('banco-a');
  const waybillNo = WaybillNumber.of('G-1');

  it('una guía agendada no puede agendarse ni marcarse sin cobertura de nuevo', () => {
    const waybill = Waybill.pending(tenant, waybillNo);
    waybill.schedule(CivilDate.fromISO('2026-10-28'));

    expect(() => waybill.schedule(CivilDate.fromISO('2026-10-29'))).toThrow(WaybillAlreadyScheduled);
    expect(() => waybill.markNoCoverage()).toThrow(WaybillAlreadyScheduled);
  });

  it('no se puede reconstruir un estado incoherente (AGENDADA sin fecha)', () => {
    expect(() => Waybill.rehydrate(tenant, waybillNo, 'AGENDADA', null, 0)).toThrow(InvalidInput);
    expect(() =>
      Waybill.rehydrate(tenant, waybillNo, 'SIN_COBERTURA', CivilDate.fromISO('2026-10-28'), 0),
    ).toThrow(InvalidInput);
  });

  it('la versión sube con cada cambio de estado y originalVersion conserva la leída', () => {
    const waybill = Waybill.rehydrate(tenant, waybillNo, 'PENDIENTE_AGENDA', null, 3);
    expect([waybill.version, waybill.originalVersion, waybill.hasChanges()]).toEqual([3, 3, false]);

    waybill.schedule(CivilDate.fromISO('2026-10-28'));

    expect([waybill.version, waybill.originalVersion, waybill.hasChanges()]).toEqual([4, 3, true]);
  });

  it('marcar SIN_COBERTURA una guía que ya lo está no cambia la versión', () => {
    const waybill = Waybill.rehydrate(tenant, waybillNo, 'SIN_COBERTURA', null, 1);

    waybill.markNoCoverage();

    expect(waybill.version).toBe(1);
    expect(waybill.hasChanges()).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])('rechaza la versión inválida %s', (version) => {
    expect(() => Waybill.rehydrate(tenant, waybillNo, 'PENDIENTE_AGENDA', null, version)).toThrow(InvalidInput);
  });
});

describe('SystemClock', () => {
  it('usa la fecha de Bogotá, no la UTC: 03:00 UTC del 28 sigue siendo 27 en Colombia', () => {
    const clock = new SystemClock('America/Bogota', () => new Date('2026-10-28T03:00:00Z'));
    expect(clock.today().toString()).toBe('2026-10-27');
  });

  it('pasa al día siguiente cuando en Bogotá ya es medianoche', () => {
    const clock = new SystemClock('America/Bogota', () => new Date('2026-10-28T05:00:00Z'));
    expect(clock.today().toString()).toBe('2026-10-28');
  });
});

/**
 * Black-box functional tests, groups A–G: appointment rule, calendar, window,
 * waybill status, inputs, multitenancy and time. They only use the public API (../../src).
 * Traceability: rule = Parte C statement; status/version = Parte A §3 Datos; isolation = Parte A §4.
 */
import { describe, expect, it } from 'vitest';
import {
  ScheduleWaybill,
  InvalidInput,
  Waybill,
  WaybillNumber,
  CivilDate,
  SystemClock,
  TenantId,
} from '../../src';
import { CITIES, TENANTS } from '../_comun/data';
import {
  MON_FRI_SET,
  ALL,
  WEEKEND,
  schedule,
  defineCoverage,
  daysSince,
  expectedOf,
  world,
  worldWith,
} from './helpers';

const TODAY = '2026-10-27'; // Tuesday
const NO_COVERAGE = { status: 'SIN_COBERTURA', appointmentDate: null };
const T = TenantId.of('banco-a');
const N = WaybillNumber.of('G-1');

describe('A · Regla de la cita', () => {
  it('A1 · lunes a viernes, hoy martes 2026-10-27 → 2026-10-28', async () => {
    const r = await schedule(worldWith(TODAY, MON_FRI_SET));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(r).toEqual(expectedOf(TODAY, MON_FRI_SET));
  });

  it('A2 · solo viernes → 2026-10-30', async () => {
    const r = await schedule(worldWith(TODAY, [5]));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-30' });
    expect(r).toEqual(expectedOf(TODAY, [5]));
  });

  it('A3 · solo martes (hoy no cuenta) → 2026-11-03', async () => {
    const r = await schedule(worldWith(TODAY, [2]));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-11-03' });
    expect(r).toEqual(expectedOf(TODAY, [2]));
  });

  it('A4 · lunes y viernes → 2026-10-30', async () => {
    const r = await schedule(worldWith(TODAY, [1, 5]));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-30' });
    expect(r).toEqual(expectedOf(TODAY, [1, 5]));
  });

  it('A5 · todos los días con hoy viernes 2026-10-30 → 2026-11-02 (salta sábado y domingo)', async () => {
    const r = await schedule(worldWith('2026-10-30', ALL));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-11-02' });
    expect(r).toEqual(expectedOf('2026-10-30', ALL));
  });

  it.each(ALL)('A6 · solo el día %i de la semana, hoy 2026-10-27, coincide con el oráculo', async (dayNumber) => {
    const r = await schedule(worldWith(TODAY, [dayNumber]));
    expect(r).toEqual(expectedOf(TODAY, [dayNumber]));
  });

  it.each(ALL)('A7 · solo el día %i de la semana, hoy 2026-10-30, coincide con el oráculo', async (dayNumber) => {
    const r = await schedule(worldWith('2026-10-30', [dayNumber]));
    expect(r).toEqual(expectedOf('2026-10-30', [dayNumber]));
  });
});

describe('B · Fines de semana y calendario', () => {
  it.each(['2026-10-30', '2026-10-31', '2026-11-01'])(
    'B1 · hoy %s (viernes, sábado o domingo) con lunes a viernes → 2026-11-02',
    async (today) => {
      const r = await schedule(worldWith(today, MON_FRI_SET));
      expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-11-02' });
      expect(r).toEqual(expectedOf(today, MON_FRI_SET));
    },
  );

  it.each(['2026-10-27', '2026-10-30', '2026-10-31', '2026-11-01'])(
    'B2 · solo sábado y domingo, hoy %s → SIN_COBERTURA',
    async (today) => {
      const r = await schedule(worldWith(today, WEEKEND));
      expect(r).toEqual(NO_COVERAGE);
      expect(r).toEqual(expectedOf(today, WEEKEND));
    },
  );

  it('B3 · cruce de año: hoy 2026-12-31 → 2027-01-01', async () => {
    const r = await schedule(worldWith('2026-12-31', ALL));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2027-01-01' });
    expect(r).toEqual(expectedOf('2026-12-31', ALL));
  });

  it('B4 · cruce de año con lunes a viernes: hoy 2026-12-31 → 2027-01-01', async () => {
    const r = await schedule(worldWith('2026-12-31', MON_FRI_SET));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2027-01-01' });
  });

  it('B5 · año bisiesto: hoy 2028-02-28 con todos los días → 2028-02-29', async () => {
    const r = await schedule(worldWith('2028-02-28', ALL));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2028-02-29' });
    expect(r).toEqual(expectedOf('2028-02-28', ALL));
  });

  it('B6 · año no bisiesto: hoy 2027-02-28 con todos los días → 2027-03-01', async () => {
    const r = await schedule(worldWith('2027-02-28', ALL));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2027-03-01' });
    expect(r).toEqual(expectedOf('2027-02-28', ALL));
  });
});

describe('C · Ventana de 15 días', () => {
  it('C1 · festivos en los días 1 a 14 → cita el día 15 = 2026-11-11', async () => {
    const r = await schedule(worldWith(TODAY, ALL, daysSince(TODAY, 1, 14)));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-11-11' });
    expect(r).toEqual(expectedOf(TODAY, ALL, daysSince(TODAY, 1, 14)));
  });

  it('C2 · festivos en los días 1 a 15 → SIN_COBERTURA (el día 16 queda fuera)', async () => {
    const r = await schedule(worldWith(TODAY, ALL, daysSince(TODAY, 1, 15)));
    expect(r).toEqual(NO_COVERAGE);
    expect(r).toEqual(expectedOf(TODAY, ALL, daysSince(TODAY, 1, 15)));
  });

  it('C3 · festivo mañana → salta al siguiente día hábil: 2026-10-29', async () => {
    const r = await schedule(worldWith(TODAY, ALL, ['2026-10-28']));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-29' });
  });

  it('C4 · cobertura sin días de la semana → SIN_COBERTURA', async () => {
    const r = await schedule(worldWith(TODAY, []));
    expect(r).toEqual(NO_COVERAGE);
  });

  it('C5 · ciudad sin cobertura configurada → SIN_COBERTURA', async () => {
    const r = await schedule(world(TODAY));
    expect(r).toEqual(NO_COVERAGE);
  });

  it('C6 · cobertura de otra ciudad no aplica → SIN_COBERTURA', async () => {
    const m = world(TODAY);
    defineCoverage(m, 'banco-a', 'Cali', ALL);
    expect(await schedule(m)).toEqual(NO_COVERAGE);
  });

  it('C7 · cobertura solo martes con festivo el 2026-11-03 → 2026-11-10 (día 14 de la ventana)', async () => {
    const r = await schedule(worldWith(TODAY, [2], ['2026-11-03']));
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-11-10' });
  });

  it('C8 · cobertura solo martes con festivos el 2026-11-03 y 2026-11-10 → SIN_COBERTURA', async () => {
    const r = await schedule(worldWith(TODAY, [2], ['2026-11-03', '2026-11-10']));
    expect(r).toEqual(NO_COVERAGE);
  });

  it.each(Array.from({ length: 16 }, (_, i) => i + 1))(
    'C9 · festivos en los días 1 a %i-1 con todos los días: coincide con el oráculo',
    async (k) => {
      const holidays = k > 1 ? daysSince(TODAY, 1, k - 1) : [];
      const r = await schedule(worldWith(TODAY, ALL, holidays));
      expect(r).toEqual(expectedOf(TODAY, ALL, holidays));
    },
  );
});

describe('D · Estado de la guía (idempotencia, versión y reintentos)', () => {
  it('D1 · guía ya agendada: devuelve su cita sin recalcular y sin escribir', async () => {
    const m = worldWith(TODAY, ALL); // would recalculate to 2026-10-28
    m.waybills.internal.seed(Waybill.rehydrate(T, N, 'AGENDADA', CivilDate.fromISO('2026-10-29'), 1));
    const r = await schedule(m);
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-29' });
    expect(m.waybills.writes).toBe(0);
    expect((await m.waybills.internal.find(T, N))?.version).toBe(1);
  });

  it('D2 · ejecutar dos veces: misma cita y una sola escritura', async () => {
    const m = worldWith(TODAY, ALL);
    const first = await schedule(m);
    const second = await schedule(m);
    expect(second).toEqual(first);
    expect(first.appointmentDate).toBe('2026-10-28');
    expect(m.waybills.writes).toBe(1);
  });

  it('D3 · SIN_COBERTURA se reintenta y se agenda cuando aparece cobertura', async () => {
    const m = world(TODAY);
    expect(await schedule(m)).toEqual(NO_COVERAGE);
    expect(m.waybills.writes).toBe(1);
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    expect(await schedule(m)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(m.waybills.writes).toBe(2);
    expect((await m.waybills.internal.find(T, N))?.version).toBe(2);
  });

  it('D4 · reintento sin cobertura nueva: no escribe ni sube la versión', async () => {
    const m = world(TODAY);
    await schedule(m);
    await schedule(m);
    const third = await schedule(m);
    expect(third).toEqual(NO_COVERAGE);
    expect(m.waybills.internal.writes).toBe(1);
    expect((await m.waybills.internal.find(T, N))?.version).toBe(1);
  });

  it('D5 · guía inexistente: se crea pendiente y se agenda (versión 1)', async () => {
    const m = worldWith(TODAY, ALL);
    expect(await m.waybills.internal.find(T, N)).toBeNull();
    expect(await schedule(m)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    const g = await m.waybills.internal.find(T, N);
    expect(g?.status).toBe('AGENDADA');
    expect(g?.appointmentDate?.toString()).toBe('2026-10-28');
    expect(g?.version).toBe(1);
  });

  it('D6 · secuencia de versiones 0 → 1 → 2 → 2', async () => {
    const m = world(TODAY);
    const version = async () => (await m.waybills.internal.find(T, N))?.version ?? 0;
    const seq = [await version()];
    await schedule(m);
    seq.push(await version());
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    await schedule(m);
    seq.push(await version());
    await schedule(m);
    seq.push(await version());
    expect(seq).toEqual([0, 1, 2, 2]);
  });

  it('D7 · guía pendiente con versión 3 → al agendar sube a 4 (no reinicia)', async () => {
    const m = worldWith(TODAY, ALL);
    m.waybills.internal.seed(Waybill.rehydrate(T, N, 'PENDIENTE_AGENDA', null, 3));
    expect(await schedule(m)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect((await m.waybills.internal.find(T, N))?.version).toBe(4);
  });

  it('D8 · guía SIN_COBERTURA sembrada (versión 1) con cobertura → agenda en versión 2', async () => {
    const m = worldWith(TODAY, ALL);
    m.waybills.internal.seed(Waybill.rehydrate(T, N, 'SIN_COBERTURA', null, 1));
    expect(await schedule(m)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect((await m.waybills.internal.find(T, N))?.version).toBe(2);
  });

  it('D9 · cambiar la cobertura después de agendar no mueve la cita', async () => {
    const m = worldWith(TODAY, ALL);
    await schedule(m);
    defineCoverage(m, 'banco-a', 'Medellín', [5]);
    expect(await schedule(m)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(m.waybills.writes).toBe(1);
  });
});

describe('E · Entradas', () => {
  const empty = ['', ' ', '   ', '\t', '\n '];
  const fields = ['tenant', 'waybillNumber', 'city'] as const;
  const useCases = fields.flatMap((field) => empty.map((value) => [field, value] as const));

  it.each(useCases)('E1 · campo %s vacío o con solo espacios (%j) → InvalidInput sin tocar repositorios', async (field, value) => {
    const m = worldWith(TODAY, ALL);
    const command = { tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellín', [field]: value };
    await expect(m.useCase.execute(command)).rejects.toBeInstanceOf(InvalidInput);
    expect(m.waybills.reads).toBe(0);
    expect(m.waybills.writes).toBe(0);
    expect(m.coverages.reads).toBe(0);
  });

  it.each([
    ['  banco-a ', 'G-1', 'Medellín'],
    ['banco-a', '  G-1 ', 'Medellín'],
    ['banco-a', 'G-1', '  Medellín  '],
  ])('E2 · espacios sobrantes en (%j, %j, %j) se ignoran: es la misma guía', async (t, n, c) => {
    const m = worldWith(TODAY, ALL);
    const withSpaces = await m.useCase.execute({ tenant: t, waybillNumber: n, city: c });
    const cleaned = await schedule(m);
    expect(withSpaces).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(cleaned).toEqual(withSpaces);
    expect(m.waybills.internal.writes).toBe(1);
  });

  it.each(['Medellín', 'MEDELLIN', ' medellin ', 'Medellin', 'MEDELLÍN', 'medellín'])(
    'E3 · la ciudad %j es Medellín',
    async (city) => {
      const m = world(TODAY);
      defineCoverage(m, 'banco-a', 'Medellín', ALL);
      expect(await schedule(m, 'banco-a', 'G-1', city)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    },
  );

  it('E4 · espacios internos en la ciudad: «  Santa   Marta » es «Santa Marta»', async () => {
    const m = world(TODAY);
    defineCoverage(m, 'banco-a', 'Santa Marta', ALL);
    expect(await schedule(m, 'banco-a', 'G-1', '  Santa   Marta ')).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
  });
});

describe('F · Multitenancy y aislamiento', () => {
  it('F1 · mismo número de guía en dos tenants evoluciona de forma independiente', async () => {
    const m = world(TODAY);
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    expect(await schedule(m, 'banco-a', 'G-1')).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(await schedule(m, 'banco-b', 'G-1')).toEqual(NO_COVERAGE);

    const wa = await m.waybills.internal.find(TenantId.of('banco-a'), N);
    const wb = await m.waybills.internal.find(TenantId.of('banco-b'), N);
    expect([wa?.status, wa?.version]).toEqual(['AGENDADA', 1]);
    expect([wb?.status, wb?.version]).toEqual(['SIN_COBERTURA', 1]);

    defineCoverage(m, 'banco-b', 'Medellín', MON_FRI_SET);
    expect(await schedule(m, 'banco-b', 'G-1')).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect((await m.waybills.internal.find(TenantId.of('banco-a'), N))?.version).toBe(1);
    expect(m.waybills.internal.writes).toBe(3);
  });

  it('F2 · coberturas distintas por tenant dan citas distintas', async () => {
    const m = world(TODAY);
    defineCoverage(m, 'banco-a', 'Medellín', [5]);
    defineCoverage(m, 'banco-b', 'Medellín', [2]);
    expect(await schedule(m, 'banco-a', 'G-1')).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-30' });
    expect(await schedule(m, 'banco-b', 'G-1')).toEqual({ status: 'AGENDADA', appointmentDate: '2026-11-03' });
  });

  it('F3 · un tenant sin cobertura queda SIN_COBERTURA aunque otro la tenga', async () => {
    const m = world(TODAY);
    defineCoverage(m, 'banco-a', 'Medellín', ALL);
    expect(await schedule(m, 'banco-c', 'G-1')).toEqual(NO_COVERAGE);
  });

  it.each(TENANTS.slice(0, 10).map((t, i) => [t, i]))(
    'F4 · %s con cobertura propia (día %i) ve solo su cita, con 10 tenants definidos a la vez',
    async (tenant, i) => {
      const m = world(TODAY);
      TENANTS.slice(0, 10).forEach((t, j) => defineCoverage(m, t, 'Medellín', [(j % 7) + 1]));
      const r = await schedule(m, tenant, 'G-1');
      expect(r).toEqual(expectedOf(TODAY, [(i % 7) + 1]));
    },
  );

  it.each(TENANTS.slice(10, 15))('F5 · %s sin cobertura propia → SIN_COBERTURA aunque otros tengan', async (tenant) => {
    const m = world(TODAY);
    TENANTS.slice(0, 10).forEach((t) => defineCoverage(m, t, 'Medellín', ALL));
    expect(await schedule(m, tenant, 'G-1')).toEqual(NO_COVERAGE);
  });
});

describe('G · Tiempo (SystemClock y zona horaria)', () => {
  it('G1 · Bogotá 2026-10-28T03:00Z es el 2026-10-27 (todavía es la noche anterior)', () => {
    const clock = new SystemClock('America/Bogota', () => new Date('2026-10-28T03:00:00Z'));
    expect(clock.today().toString()).toBe('2026-10-27');
  });

  it('G2 · Bogotá 2026-10-28T05:00Z es el 2026-10-28 (00:00 locales)', () => {
    const clock = new SystemClock('America/Bogota', () => new Date('2026-10-28T05:00:00Z'));
    expect(clock.today().toString()).toBe('2026-10-28');
  });

  it('G3 · cambio de mes: 2026-11-01T04:59:59Z es 10-31 y 05:00:00Z es 11-01 en Bogotá', () => {
    expect(new SystemClock('America/Bogota', () => new Date('2026-11-01T04:59:59Z')).today().toString()).toBe('2026-10-31');
    expect(new SystemClock('America/Bogota', () => new Date('2026-11-01T05:00:00Z')).today().toString()).toBe('2026-11-01');
  });

  it('G4 · cambio de año: 2027-01-01T04:59:59Z es 2026-12-31 y 05:00:00Z es 2027-01-01 en Bogotá', () => {
    expect(new SystemClock('America/Bogota', () => new Date('2027-01-01T04:59:59Z')).today().toString()).toBe('2026-12-31');
    expect(new SystemClock('America/Bogota', () => new Date('2027-01-01T05:00:00Z')).today().toString()).toBe('2027-01-01');
  });

  it.each([
    ['America/Mexico_City', '2026-10-28T05:30:00Z', '2026-10-27'],
    ['America/Mexico_City', '2026-10-28T06:00:00Z', '2026-10-28'],
    ['Europe/Madrid', '2026-10-27T22:30:00Z', '2026-10-27'],
    ['Europe/Madrid', '2026-10-27T23:30:00Z', '2026-10-28'],
    ['UTC', '2026-10-27T23:59:59Z', '2026-10-27'],
    ['UTC', '2026-10-28T00:00:00Z', '2026-10-28'],
    ['America/Bogota', '2026-10-28T04:59:59Z', '2026-10-27'],
  ])('G5 · zona %s en %s → %s', (zone, instant, expected) => {
    const clock = new SystemClock(zone, () => new Date(instant));
    expect(clock.today().toString()).toBe(expected);
    // Cross-check against the Intl API: same local date the system returns.
    const iso = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(instant));
    expect(iso).toBe(expected);
  });

  it('G6 · sin zona explícita, el reloj usa America/Bogota', () => {
    const clock = new SystemClock(undefined, () => new Date('2026-10-28T03:00:00Z'));
    expect(clock.today().toString()).toBe('2026-10-27');
  });

  it('G7 · el mismo instante con reloj de Bogotá agenda 2026-10-28; con reloj UTC, 2026-10-29', async () => {
    const instant = new Date('2026-10-28T03:00:00Z');
    const bogota = new SystemClock('America/Bogota', () => instant);
    const utc = new SystemClock('UTC', () => instant);
    const testRunBogota = world(TODAY);
    defineCoverage(testRunBogota, 'banco-a', 'Medellín', ALL);
    const useCaseBogota = new ScheduleWaybill(testRunBogota.waybills, testRunBogota.coverages, bogota);
    expect(await useCaseBogota.execute({ tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellín' })).toEqual({
      status: 'AGENDADA',
      appointmentDate: '2026-10-28',
    });
    const useCaseUtc = new ScheduleWaybill(testRunBogota.waybills, testRunBogota.coverages, utc);
    expect(await useCaseUtc.execute({ tenant: 'banco-a', waybillNumber: 'G-2', city: 'Medellín' })).toEqual({
      status: 'AGENDADA',
      appointmentDate: '2026-10-29',
    });
  });
});

describe('G · Catálogo común de ciudades', () => {
  it.each(CITIES)('G8 · %s se normaliza sin error y agenda con su cobertura', async (city) => {
    const m = world(TODAY);
    defineCoverage(m, 'banco-a', city, ALL);
    expect(await schedule(m, 'banco-a', 'G-1', city)).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
  });
});

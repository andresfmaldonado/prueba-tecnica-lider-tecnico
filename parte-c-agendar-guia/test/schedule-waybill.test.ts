import { describe, expect, it } from 'vitest';
import {
  ScheduleWaybill,
  City,
  Coverage,
  InMemoryCoverageRepository,
  VersionConflict,
  InvalidInput,
  CivilDate,
  Waybill,
  InMemoryWaybillRepository,
  ATTEMPTS_ON_CONFLICT,
  WaybillNumber,
  FixedClock,
  TenantId,
} from '../src';
import type { Weekday, WaybillRepository } from '../src';

const MON_TO_FRI: Weekday[] = [1, 2, 3, 4, 5];
const [MON, TUE, , , FRI, SAT, SUN] = [1, 2, 3, 4, 5, 6, 7] as const;

// Tuesday 2026-10-27 unless the test says otherwise.
const TUESDAY = CivilDate.fromISO('2026-10-27');

const date = CivilDate.fromISO;
const range = (today: CivilDate, from: number, until: number): CivilDate[] =>
  Array.from({ length: until - from + 1 }, (_, i) => today.plusDays(from + i));

function scenario(options: { today?: CivilDate } = {}) {
  const waybills = new InMemoryWaybillRepository();
  const coverages = new InMemoryCoverageRepository();
  const clock = new FixedClock(options.today ?? TUESDAY);
  const schedule = new ScheduleWaybill(waybills, coverages, clock);

  return {
    schedule,
    waybills,
    coverages,
    clock,
    pendingWaybill(tenant = 'banco-a', waybillNo = 'G-1') {
      waybills.seed(Waybill.pending(TenantId.of(tenant), WaybillNumber.of(waybillNo)));
    },
    coverage(cov: Coverage, tenant = 'banco-a', city = 'Medellin') {
      coverages.define(TenantId.of(tenant), City.of(city), cov);
    },
    execute(overwrites: Partial<{ tenant: string; waybillNumber: string; city: string }> = {}) {
      return schedule.execute({ tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellin', ...overwrites });
    },
    async savedStatus(tenant = 'banco-a', waybillNo = 'G-1') {
      const g = await waybills.find(TenantId.of(tenant), WaybillNumber.of(waybillNo));
      return g && { status: g.status, appointmentDate: g.appointmentDate?.toString() ?? null };
    },
    async savedVersion(tenant = 'banco-a', waybillNo = 'G-1') {
      return (await waybills.find(TenantId.of(tenant), WaybillNumber.of(waybillNo)))?.version ?? null;
    },
  };
}

describe('Agendar una guía — regla de la cita', () => {
  it('agenda mañana cuando mañana es hábil y tiene cobertura', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI));

    expect(await e.execute()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(await e.savedStatus()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
  });

  it('toma el primer día de cobertura aunque no sea mañana', async () => {
    const e = scenario(); // Tuesday; coverage only on Friday
    e.pendingWaybill();
    e.coverage(new Coverage([FRI]));

    expect((await e.execute()).appointmentDate).toBe('2026-10-30');
  });

  it('«a partir de mañana»: hoy no cuenta aunque sea día de cobertura', async () => {
    const e = scenario(); // today is Tuesday; coverage only on Tuesday
    e.pendingWaybill();
    e.coverage(new Coverage([TUE]));

    expect((await e.execute()).appointmentDate).toBe('2026-11-03'); // the following Tuesday
  });

  it('elige la fecha más cercana entre varios días de cobertura', async () => {
    const e = scenario(); // Tuesday; coverage on Monday and Friday
    e.pendingWaybill();
    e.coverage(new Coverage([MON, FRI]));

    expect((await e.execute()).appointmentDate).toBe('2026-10-30');
  });
});

describe('Agendar una guía — fines de semana', () => {
  it.each([
    ['viernes', '2026-10-30'],
    ['sábado', '2026-10-31'],
    ['domingo', '2026-11-01'],
  ])('si hoy es %s, salta el fin de semana y agenda el lunes', async (_day, today) => {
    const e = scenario({ today: date(today) });
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI));

    expect((await e.execute()).appointmentDate).toBe('2026-11-02');
  });

  it('un día de cobertura en sábado o domingo no es hábil: queda SIN_COBERTURA', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage([SAT, SUN]));

    expect(await e.execute()).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
  });

  it('cruza fin de mes y de año sin errores de calendario', async () => {
    const e = scenario({ today: date('2026-12-31') }); // Thursday
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI));

    expect((await e.execute()).appointmentDate).toBe('2027-01-01');
  });
});

describe('Agendar una guía — sin cobertura', () => {
  it('sin cobertura configurada para la ciudad: SIN_COBERTURA y se persiste', async () => {
    const e = scenario();
    e.pendingWaybill();

    expect(await e.execute()).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
    expect(await e.savedStatus()).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
  });

  it('cobertura sin ningún día: SIN_COBERTURA', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage([]));

    expect((await e.execute()).status).toBe('SIN_COBERTURA');
  });

  it('la cobertura de otra ciudad no aplica', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI), 'banco-a', 'Bogota');

    expect((await e.execute({ city: 'Medellin' })).status).toBe('SIN_COBERTURA');
  });

  it('una guía SIN_COBERTURA se puede reintentar cuando aparece cobertura', async () => {
    const e = scenario();
    e.pendingWaybill();
    expect((await e.execute()).status).toBe('SIN_COBERTURA');

    e.coverage(new Coverage(MON_TO_FRI));

    expect(await e.execute()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
  });
});

describe('Agendar una guía — ventana de 15 días', () => {
  it('el día 15 todavía cuenta', async () => {
    const e = scenario(); // today + 15 = Wednesday 2026-11-11
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI, range(TUESDAY, 1, 14))); // holidays/closures on days 1..14

    expect((await e.execute()).appointmentDate).toBe('2026-11-11');
  });

  it('el día 16 ya queda fuera de la ventana', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI, range(TUESDAY, 1, 15))); // day 16 would have coverage

    expect(await e.execute()).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
  });

  it('una fecha no disponible (festivo) se salta aunque su día de semana tenga cobertura', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI, [date('2026-10-28')])); // tomorrow is a holiday

    expect((await e.execute()).appointmentDate).toBe('2026-10-29');
  });
});

describe('Agendar una guía — idempotencia', () => {
  it('si ya está agendada devuelve la cita existente sin recalcular ni escribir', async () => {
    const e = scenario();
    e.waybills.seed(
      Waybill.rehydrate(TenantId.of('banco-a'), WaybillNumber.of('G-1'), 'AGENDADA', date('2026-10-29'), 1),
    );
    e.coverage(new Coverage([MON])); // if it were recalculated, it would give a different date

    expect(await e.execute()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-29' });
    expect(e.waybills.writes).toBe(0);
  });

  it('ejecutar dos veces seguidas da la misma cita y escribe una sola vez', async () => {
    const e = scenario();
    e.pendingWaybill();
    e.coverage(new Coverage(MON_TO_FRI));

    const first = await e.execute();
    e.clock.setToday(date('2026-11-02')); // days pass; the appointment does not move
    const second = await e.execute();

    expect(second).toEqual(first);
    expect(e.waybills.writes).toBe(1);
  });
});

describe('Agendar una guía — entradas y errores', () => {
  it.each([
    ['tenant', { tenant: '  ' }],
    ['waybillNumber', { waybillNumber: '' }],
    ['ciudad', { city: ' ' }],
  ])('rechaza %s vacío antes de tocar los repositorios', async (_field, input) => {
    const e = scenario();
    e.pendingWaybill();

    await expect(e.execute(input)).rejects.toBeInstanceOf(InvalidInput);
    expect(e.waybills.writes).toBe(0);
  });

  it('«Medellín», «MEDELLIN» y « medellin » son la misma ciudad', async () => {
    const e = scenario();
    e.coverage(new Coverage(MON_TO_FRI), 'banco-a', 'Medellín');

    for (const [i, city] of ['MEDELLIN', ' medellin ', 'Medellín'].entries()) {
      e.pendingWaybill('banco-a', `G-${i}`);
      const r = await e.execute({ waybillNumber: `G-${i}`, city });
      expect(r.status).toBe('AGENDADA');
    }
  });
});

describe('Agendar una guía — multitenancy', () => {
  it('la guía de un tenant no se mezcla con la de otro, aunque el número coincida', async () => {
    const e = scenario();
    e.pendingWaybill('banco-a', 'G-1');
    e.coverage(new Coverage(MON_TO_FRI), 'banco-b');

    const r = await e.execute({ tenant: 'banco-b', waybillNumber: 'G-1' });

    expect(r.status).toBe('AGENDADA'); // banco-b creates its own schedule
    expect(await e.savedStatus('banco-a')).toEqual({ status: 'PENDIENTE_AGENDA', appointmentDate: null });
  });

  it('cada tenant usa su propia cobertura para la misma ciudad y la misma guía', async () => {
    const e = scenario(); // Tuesday
    e.pendingWaybill('banco-a', 'G-1');
    e.pendingWaybill('banco-b', 'G-1');
    e.coverage(new Coverage([TUE, FRI]), 'banco-a'); // next: Friday
    e.coverage(new Coverage([MON]), 'banco-b'); // next: the following Monday

    expect((await e.execute({ tenant: 'banco-a' })).appointmentDate).toBe('2026-10-30');
    expect((await e.execute({ tenant: 'banco-b' })).appointmentDate).toBe('2026-11-02');
  });
});

describe('Agendar una guía — guía que aún no existe en el servicio', () => {
  it('no es un error: se crea pendiente con los datos del comando y se agenda', async () => {
    const e = scenario();
    e.coverage(new Coverage(MON_TO_FRI));

    expect(await e.execute()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(await e.savedStatus()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(e.waybills.writes).toBe(1);
  });

  it('sin cobertura queda creada como SIN_COBERTURA', async () => {
    const e = scenario();

    expect(await e.execute()).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
    expect(await e.savedStatus()).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
  });
});

describe('Agendar una guía — versión y control optimista', () => {
  it('la versión sube con cada cambio de estado: 0 → 1 (SIN_COBERTURA) → 2 (AGENDADA)', async () => {
    const e = scenario();
    e.pendingWaybill();
    expect(await e.savedVersion()).toBe(0);

    await e.execute();
    expect(await e.savedVersion()).toBe(1);

    e.coverage(new Coverage(MON_TO_FRI));
    await e.execute();
    expect(await e.savedVersion()).toBe(2);
  });

  it('reintentar una guía SIN_COBERTURA sin cobertura nueva no escribe ni sube la versión', async () => {
    const e = scenario();
    e.pendingWaybill();
    await e.execute();
    const writes = e.waybills.writes;

    await e.execute();

    expect(e.waybills.writes).toBe(writes);
    expect(await e.savedVersion()).toBe(1);
  });

  it('dos solicitudes simultáneas para la misma guía dan la misma cita y una sola escritura', async () => {
    const e = scenario();
    e.coverage(new Coverage(MON_TO_FRI));

    const [a, b] = await Promise.all([e.execute(), e.execute()]);

    expect(a).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
    expect(b).toEqual(a);
    expect(e.waybills.writes).toBe(1);
    expect(await e.savedVersion()).toBe(1);
  });

  it('el repositorio rechaza guardar una guía leída con una versión vieja', async () => {
    const e = scenario();
    e.pendingWaybill();
    const tenant = TenantId.of('banco-a');
    const waybillNo = WaybillNumber.of('G-1');
    const first = (await e.waybills.find(tenant, waybillNo))!;
    const second = (await e.waybills.find(tenant, waybillNo))!;

    first.schedule(date('2026-10-28'));
    await e.waybills.save(first);
    second.markNoCoverage();

    await expect(e.waybills.save(second)).rejects.toBeInstanceOf(VersionConflict);
    expect(await e.savedStatus()).toEqual({ status: 'AGENDADA', appointmentDate: '2026-10-28' });
  });

  it('si el conflicto persiste tras reintentar, el error se propaga', async () => {
    let savedItems = 0;
    const waybills: WaybillRepository = {
      find: async () => null,
      save: async () => {
        savedItems++;
        throw new VersionConflict('conflicto simulado');
      },
    };
    const coverages = new InMemoryCoverageRepository();
    coverages.define(TenantId.of('banco-a'), City.of('Medellin'), new Coverage(MON_TO_FRI));
    const schedule = new ScheduleWaybill(waybills, coverages, new FixedClock(TUESDAY));

    await expect(schedule.execute({ tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellin' })).rejects.toBeInstanceOf(
      VersionConflict,
    );
    expect(savedItems).toBe(ATTEMPTS_ON_CONFLICT);
  });
});

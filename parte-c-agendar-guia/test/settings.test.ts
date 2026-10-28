import { describe, expect, it } from 'vitest';
import {
  CivilDate,
  Coverage,
  DEFAULT_SETTINGS,
  FixedClock,
  InMemoryCoverageRepository,
  InMemoryWaybillRepository,
  InvalidConfiguration,
  ScheduleWaybill,
  settingsFromEnvironment,
  firstCoverageDay,
} from '../src';

describe('settingsFromEnvironment', () => {
  it('sin variables conserva el comportamiento actual', () => {
    const s = settingsFromEnvironment({});
    expect(s.windowDays).toBe(15);
    expect(s.conflictAttempts).toBe(2);
    expect([...s.businessDays]).toEqual([1, 2, 3, 4, 5]);
    expect(s.timeZone).toBe('America/Bogota');
  });

  it('las variables vacías cuentan como no definidas', () => {
    expect(settingsFromEnvironment({ SCHEDULING_WINDOW_DAYS: ' ' }).windowDays).toBe(15);
  });

  it('lee valores válidos', () => {
    const s = settingsFromEnvironment({
      SCHEDULING_WINDOW_DAYS: '30',
      SCHEDULING_CONFLICT_ATTEMPTS: '3',
      SCHEDULING_BUSINESS_DAYS: '1, 2,3,4,5,6',
      SCHEDULING_TIME_ZONE: 'America/Mexico_City',
    });
    expect(s).toMatchObject({ windowDays: 30, conflictAttempts: 3, timeZone: 'America/Mexico_City' });
    expect(s.businessDays.has(6)).toBe(true);
  });

  it.each([
    ['SCHEDULING_WINDOW_DAYS', '0'],
    ['SCHEDULING_WINDOW_DAYS', '61'],
    ['SCHEDULING_WINDOW_DAYS', '1.5'],
    ['SCHEDULING_WINDOW_DAYS', 'abc'],
    ['SCHEDULING_CONFLICT_ATTEMPTS', '11'],
    ['SCHEDULING_BUSINESS_DAYS', '0,1'],
    ['SCHEDULING_BUSINESS_DAYS', 'lunes'],
    ['SCHEDULING_TIME_ZONE', 'Marte/Olympus'],
  ])('rechaza %s=%s', (name, value) => {
    expect(() => settingsFromEnvironment({ [name]: value })).toThrow(InvalidConfiguration);
  });
});

describe('configuración aplicada al caso de uso', () => {
  const monday = CivilDate.fromISO('2026-10-26');

  it('windowDays limita la búsqueda', () => {
    // Thursdays only; the first one (+3) is a holiday, so the next is +10.
    const coverage = new Coverage([4], [monday.plusDays(3)]);
    const rules = { ...DEFAULT_SETTINGS, windowDays: 5 };
    expect(firstCoverageDay(monday, coverage, rules)).toBeNull();
    expect(firstCoverageDay(monday, coverage)).not.toBeNull();
  });

  it('businessDays admite sábados', () => {
    const saturday = monday.plusDays(5);
    const coverage = new Coverage([6]);
    expect(firstCoverageDay(monday, coverage)).toBeNull();
    const rules = { ...DEFAULT_SETTINGS, businessDays: settingsFromEnvironment({ SCHEDULING_BUSINESS_DAYS: '6' }).businessDays };
    expect(firstCoverageDay(monday, coverage, rules)?.equals(saturday)).toBe(true);
  });

  it('el use case recibe los ajustes', async () => {
    const useCase = new ScheduleWaybill(
      new InMemoryWaybillRepository(),
      new InMemoryCoverageRepository(),
      new FixedClock(monday),
      { ...DEFAULT_SETTINGS, conflictAttempts: 5 },
    );
    const result = await useCase.execute({ tenant: 't1', waybillNumber: 'G1', city: 'Cali' });
    expect(result.status).toBe('SIN_COBERTURA');
  });
});

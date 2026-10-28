/** Helpers shared by the functional tests (not a test file: Vitest does not pick it up). */
import {
  ScheduleWaybill,
  City,
  Coverage,
  InMemoryCoverageRepository,
  CivilDate,
  InMemoryWaybillRepository,
  FixedClock,
  TenantId,
} from '../../src';
import type { Weekday } from '../../src';
import { addDaysISO } from '../_comun/data';
import { expectedAppointment } from '../_comun/oracle';
import { CoveragesWithLatency, WaybillsWithLatency } from '../_comun/latency';
import type { LatencyOptions } from '../_comun/latency';

export const ALL = [1, 2, 3, 4, 5, 6, 7];
export const MON_FRI_SET = [1, 2, 3, 4, 5];
export const WEEKEND = [6, 7];

export interface Result {
  status: string;
  appointmentDate: string | null;
}

export interface World {
  waybills: WaybillsWithLatency;
  coverages: CoveragesWithLatency;
  clock: FixedClock;
  useCase: ScheduleWaybill;
}

/** New environment: in-memory repositories with counters and a clock fixed at `today` (AAAA-MM-DD). */
export function world(today: string, options: LatencyOptions = {}): World {
  const waybills = new WaybillsWithLatency(new InMemoryWaybillRepository(), options);
  const coverages = new CoveragesWithLatency(new InMemoryCoverageRepository());
  const clock = new FixedClock(CivilDate.fromISO(today));
  return { waybills, coverages, clock, useCase: new ScheduleWaybill(waybills, coverages, clock) };
}

export function defineCoverage(
  m: World,
  tenant: string,
  city: string,
  days: number[],
  unavailable: string[] = [],
): void {
  m.coverages.internal.define(
    TenantId.of(tenant),
    City.of(city),
    new Coverage(
      days as Weekday[],
      unavailable.map((f) => CivilDate.fromISO(f)),
    ),
  );
}

/** Environment with banco-a coverage in Medellín. */
export function worldWith(today: string, days: number[], unavailable: string[] = [], options: LatencyOptions = {}): World {
  const m = world(today, options);
  defineCoverage(m, 'banco-a', 'Medellín', days, unavailable);
  return m;
}

export function schedule(m: World, tenant = 'banco-a', waybillNo = 'G-1', city = 'Medellín'): Promise<Result> {
  return m.useCase.execute({ tenant, waybillNumber: waybillNo, city });
}

/** Expected result according to the independent oracle. */
export function expectedOf(today: string, days: number[], unavailable: string[] = []): Result {
  const appointment = expectedAppointment(today, days, unavailable);
  return appointment === null ? { status: 'SIN_COBERTURA', appointmentDate: null } : { status: 'AGENDADA', appointmentDate: appointment };
}

/** Dates today+from … today+until, both inclusive (AAAA-MM-DD). */
export function daysSince(today: string, from: number, until: number): string[] {
  return Array.from({ length: until - from + 1 }, (_, i) => addDaysISO(today, from + i));
}

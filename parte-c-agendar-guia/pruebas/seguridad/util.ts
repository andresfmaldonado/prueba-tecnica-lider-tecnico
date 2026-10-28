import { fileURLToPath } from 'node:url';
import { ScheduleWaybill, Coverage, InMemoryCoverageRepository, CivilDate, InMemoryWaybillRepository, FixedClock } from '../../src';
import type { ScheduleWaybillCommand, Weekday } from '../../src';

/** Root of parte-c-agendar-guia (this file lives in pruebas/seguridad/). */
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));

export const TODAY = '2026-10-28'; // Wednesday
/** Thursday: first business day with Mon–Fri coverage, within the window today+1..today+15. */
export const EXPECTED_APPOINTMENT = '2026-10-29';
export const MON_FRI: Weekday[] = [1, 2, 3, 4, 5];
export const MB = 1_048_576;

export function scenario() {
  const waybills = new InMemoryWaybillRepository();
  const coverages = new InMemoryCoverageRepository();
  const clock = new FixedClock(CivilDate.fromISO(TODAY));
  const useCase = new ScheduleWaybill(waybills, coverages, clock);
  return { waybills, coverages, clock, useCase };
}

/** Command with valid default values; `extra` overrides fields (also with deliberately invalid types). */
export function command(extra: Record<string, unknown> = {}): ScheduleWaybillCommand {
  return { tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellín', ...extra } as unknown as ScheduleWaybillCommand;
}

/** Returns the result or the thrown error, without propagating it: allows asserting the error type. */
export async function resultOf(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    return await fn();
  } catch (e) {
    return e;
  }
}

/** Measures the time (ms) of a synchronous operation; also returns the value or the error. */
export function timeIt<T>(fn: () => T): { ms: number; result: T | unknown } {
  const t0 = performance.now();
  let result: T | unknown;
  try {
    result = fn();
  } catch (e) {
    result = e;
  }
  return { ms: performance.now() - t0, result };
}

/** Measures the time (ms) of an asynchronous operation; also returns the value or the error. */
export async function timeItAsync(fn: () => Promise<unknown>): Promise<{ ms: number; result: unknown }> {
  const t0 = performance.now();
  const result = await resultOf(fn);
  return { ms: performance.now() - t0, result };
}

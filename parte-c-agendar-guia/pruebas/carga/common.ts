/** Shared utilities for the load tests: data world, concurrent batch, and statistics. */
import { ScheduleWaybill, Coverage, City, InMemoryCoverageRepository, CivilDate, InMemoryWaybillRepository, FixedClock, TenantId } from '../../src';
import type { CoverageRepository, Weekday, Waybill, WaybillRepository, WaybillNumber } from '../../src';
import { CITIES, integer, generator, addDaysISO } from '../_comun/data';
import { WaybillsWithLatency, CoveragesWithLatency } from '../_comun/latency';
import { expectedAppointment } from '../_comun/oracle';
import { CONFIG, TODAY_ISO } from './configuration';

export const TENANTS: string[] = Array.from(
  { length: CONFIG.tenants },
  (_, i) => `cliente-${String(i + 1).padStart(2, '0')}`,
);

/** Flat specification of a coverage and the appointment the oracle must produce. */
export interface Specification {
  days: number[];
  unavailable: string[];
  appointment: string | null;
}

/**
 * Seeded random coverage. Guarantees at least one business day; if the closures leave the
 * window without an appointment, they are removed. This way every waybill in the test gets an
 * appointment (AGENDADA), which makes the write check of C3 exact.
 */
function specify(rng: () => number): Specification {
  let days = [1, 2, 3, 4, 5, 6, 7].filter(() => rng() < 0.45);
  if (!days.some((d) => d <= 5)) days = [...days, integer(rng, 1, 5)].sort((a, b) => a - b);
  let closed = Array.from({ length: integer(rng, 0, 6) }, () => addDaysISO(TODAY_ISO, integer(rng, 0, 20)));
  if (expectedAppointment(TODAY_ISO, days, closed) === null) closed = [];
  return { days, unavailable: closed, appointment: expectedAppointment(TODAY_ISO, days, closed) };
}

export const specificationKey = (tenant: string, city: string): string => `${tenant}|${city}`;

/** i-th command of the batch: tenants × cities, unique waybill number. */
export function commandFor(i: number): { tenant: string; waybillNumber: string; city: string } {
  return {
    tenant: TENANTS[i % TENANTS.length]!,
    city: CITIES[Math.floor(i / TENANTS.length) % CITIES.length]!,
    waybillNumber: `G-${String(i + 1).padStart(7, '0')}`,
  };
}

/** Waybill repository that measures each call (ms via performance.now()). */
class WaybillsMeasured implements WaybillRepository {
  constructor(
    private readonly base: WaybillsWithLatency,
    private readonly times: number[],
  ) {}

  async find(tenantId: TenantId, waybillNo: WaybillNumber): Promise<Waybill | null> {
    const t0 = performance.now();
    try {
      return await this.base.find(tenantId, waybillNo);
    } finally {
      this.times.push(performance.now() - t0);
    }
  }

  async save(waybill: Waybill): Promise<void> {
    const t0 = performance.now();
    try {
      return await this.base.save(waybill);
    } finally {
      this.times.push(performance.now() - t0);
    }
  }
}

class CoveragesMeasured implements CoverageRepository {
  constructor(
    private readonly base: CoveragesWithLatency,
    private readonly times: number[],
  ) {}

  async find(tenantId: TenantId, city: City) {
    const t0 = performance.now();
    try {
      return await this.base.find(tenantId, city);
    } finally {
      this.times.push(performance.now() - t0);
    }
  }
}

export interface World {
  useCase: ScheduleWaybill;
  waybills: WaybillsWithLatency;
  /** Real in-memory repository (writes; direct reads for verification). */
  waybillsStore: InMemoryWaybillRepository;
  /** Ms per repository call (waybill read, coverage read, and write). */
  callTimes: number[];
  specifications: Map<string, Specification>;
}

/** Fresh world with the same seed: same data in every combination. */
export function createWorld(latencyMs: { readMs: number; writeMs: number }): World {
  const rng = generator(CONFIG.seedValue);
  const waybillsStore = new InMemoryWaybillRepository();
  const coveragesStore = new InMemoryCoverageRepository();
  const waybills = new WaybillsWithLatency(waybillsStore, latencyMs);
  const coverages = new CoveragesWithLatency(coveragesStore, latencyMs);
  const specifications = new Map<string, Specification>();

  for (const tenant of TENANTS) {
    for (const city of CITIES) {
      const spec = specify(rng);
      specifications.set(specificationKey(tenant, city), spec);
      coveragesStore.define(
        TenantId.of(tenant),
        City.of(city),
        new Coverage(
          spec.days as Weekday[],
          spec.unavailable.map((f) => CivilDate.fromISO(f)),
        ),
      );
    }
  }

  const callTimes: number[] = [];
  const useCase = new ScheduleWaybill(
    new WaybillsMeasured(waybills, callTimes),
    new CoveragesMeasured(coverages, callTimes),
    new FixedClock(CivilDate.fromISO(TODAY_ISO)),
  );
  return { useCase, waybills, waybillsStore, callTimes, specifications };
}

export interface BatchResult {
  launched: number;
  completed: number;
  errors: number;
  errorMessages: string[];
  seconds: number;
  waybillLatenciesMs: number[];
}

/**
 * Closed batch: `concurrency` workers take distinct waybills until `total` is reached, or until
 * `limitMs` has elapsed (in-flight calls finish), or until `stopAfterCompleted`.
 */
export async function runBatch(options: {
  useCase: ScheduleWaybill;
  total: number;
  concurrency: number;
  limitMs?: number;
  stopAfterCompleted?: number;
}): Promise<BatchResult> {
  let next = 0;
  let completed = 0;
  let errors = 0;
  let halt = false;
  const errorMessages: string[] = [];
  const waybillLatenciesMs: number[] = [];
  const start = performance.now();

  const worker = async (): Promise<void> => {
    for (;;) {
      if (halt) return;
      if (options.limitMs !== undefined && performance.now() - start >= options.limitMs) return;
      if (next >= options.total) return;
      const i = next++;
      const t0 = performance.now();
      try {
        await options.useCase.execute(commandFor(i));
        waybillLatenciesMs.push(performance.now() - t0);
        completed++;
      } catch (error) {
        errors++;
        if (errorMessages.length < 5) errorMessages.push(String(error));
      }
      if (options.stopAfterCompleted !== undefined && completed >= options.stopAfterCompleted) {
        halt = true;
      }
    }
  };

  await Promise.all(Array.from({ length: options.concurrency }, worker));
  return {
    launched: next,
    completed,
    errors,
    errorMessages,
    seconds: (performance.now() - start) / 1000,
    waybillLatenciesMs,
  };
}

/** Nearest-rank percentile. */
export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const k = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[k]!;
}

const round = (x: number): number => Math.round(x * 1000) / 1000;

export function summary(values: number[]): { n: number; p50: number; p95: number; p99: number; max: number } {
  return {
    n: values.length,
    p50: round(percentile(values, 50)),
    p95: round(percentile(values, 95)),
    p99: round(percentile(values, 99)),
    max: round(values.reduce((m, v) => (v > m ? v : m), values.length ? values[0]! : NaN)),
  };
}

export function memory(): { heapUsed: number; rss: number } {
  const m = process.memoryUsage();
  return { heapUsed: m.heapUsed, rss: m.rss };
}

export const sleep = (ms: number): Promise<void> => new Promise((solve) => setTimeout(solve, ms));

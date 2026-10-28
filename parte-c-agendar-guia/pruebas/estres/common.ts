/**
 * Utilities for the stress tests: data, use-case assembly with simulated latency, pool with
 * fixed concurrency, statistics, memory, event-loop delay, and error watching.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import {
  ScheduleWaybill,
  City,
  Coverage,
  InMemoryCoverageRepository,
  VersionConflict,
  CivilDate,
  InMemoryWaybillRepository,
  WaybillNumber,
  FixedClock,
  TenantId,
} from '../../src';
import type { ScheduleWaybillResult, Weekday, Waybill, WaybillRepository } from '../../src';
import { CITIES, TENANTS, randomCoverage, generator } from '../_comun/data';
import type { CoverageSpecification } from '../_comun/data';
import { CoveragesWithLatency, WaybillsWithLatency } from '../_comun/latency';
import type { LatencyOptions } from '../_comun/latency';
import { expectedAppointment } from '../_comun/oracle';
import {
  CONFIG,
  COVERAGE_SEED_OFFSET,
  TODAY_ISO,
  RSS_INTERVAL_MS,
  RESOLUTION_DELAY_MS,
} from './configuration';

export interface Command {
  tenant: string;
  waybillNumber: string;
  city: string;
}

export const RESULTS = fileURLToPath(new URL('./resultados/', import.meta.url));

const round = (x: number, decimals = 3): number => Math.round(x * 10 ** decimals) / 10 ** decimals;

/** i-th command: tenants × cities, waybill number unique across the whole batch. */
export function commandFor(i: number): Command {
  return {
    tenant: TENANTS[i % TENANTS.length]!,
    city: CITIES[Math.floor(i / TENANTS.length) % CITIES.length]!,
    waybillNumber: `G-${String(i + 1).padStart(7, '0')}`,
  };
}

export const comboKey = (tenant: string, city: string): string => `${tenant}|${city}`;

export interface Data {
  waybillsStore: InMemoryWaybillRepository;
  coveragesStore: InMemoryCoverageRepository;
  /** Flat specification of each tenant × city combination, for the oracle. */
  specifications: Map<string, CoverageSpecification>;
}

export function defineCoverage(data: Data, tenant: string, city: string, spec: CoverageSpecification): void {
  data.specifications.set(comboKey(tenant, city), spec);
  data.coveragesStore.define(
    TenantId.of(tenant),
    City.of(city),
    new Coverage(
      spec.days as Weekday[],
      spec.unavailable.map((f) => CivilDate.fromISO(f)),
    ),
  );
}

/** Data with random coverages that do not guarantee an appointment (may come out SIN_COBERTURA). */
export function createData(): Data {
  const rng = generator(CONFIG.seedValue);
  const data: Data = {
    waybillsStore: new InMemoryWaybillRepository(),
    coveragesStore: new InMemoryCoverageRepository(),
    specifications: new Map(),
  };
  for (const tenant of TENANTS) {
    for (const city of CITIES) {
      defineCoverage(data, tenant, city, randomCoverage(rng, TODAY_ISO));
    }
  }
  return data;
}

/** Counts the version conflicts thrown by the repository (each one triggers a retry). */
class WaybillsCounted implements WaybillRepository {
  conflicts = 0;

  constructor(private readonly base: WaybillsWithLatency) {}

  find(tenantId: TenantId, waybillNo: WaybillNumber): Promise<Waybill | null> {
    return this.base.find(tenantId, waybillNo);
  }

  async save(waybill: Waybill): Promise<void> {
    try {
      await this.base.save(waybill);
    } catch (error) {
      if (error instanceof VersionConflict) this.conflicts++;
      throw error;
    }
  }
}

export interface Assembly {
  useCase: ScheduleWaybill;
  waybills: WaybillsWithLatency;
  coverages: CoveragesWithLatency;
  counted: WaybillsCounted;
}

/** Assembles the use case over the stores in `datos` with simulated latency and failures. */
export function assemble(data: Data, options: LatencyOptions): Assembly {
  const seedValue = options.seedValue ?? CONFIG.seedValue;
  const waybills = new WaybillsWithLatency(data.waybillsStore, { ...options, seedValue });
  const coverages = new CoveragesWithLatency(data.coveragesStore, {
    ...options,
    seedValue: seedValue + COVERAGE_SEED_OFFSET,
  });
  const counted = new WaybillsCounted(waybills);
  const useCase = new ScheduleWaybill(counted, coverages, new FixedClock(CivilDate.fromISO(TODAY_ISO)));
  return { useCase, waybills, coverages, counted };
}

export interface PoolResult {
  total: number;
  completed: number;
  errors: number;
  /** Errors grouped by class name (InjectedError, VersionConflict, ...). */
  kinds: Record<string, number>;
  messages: string[];
  seconds: number;
  /** Latency of each request (ms), successes and errors, by command index. */
  latenciesMs: Float64Array;
  /** 0 pending, 1 completed, 2 with error, by command index. */
  status: Uint8Array;
  results?: ScheduleWaybillResult[];
}

/**
 * Runs all commands with `concurrency` workers: at most that many requests in flight at once.
 * With concurrency = total, all are in flight from the first tick.
 */
export async function runPool(
  useCase: ScheduleWaybill,
  commands: Command[],
  concurrency: number,
  saveResults = false,
): Promise<PoolResult> {
  const total = commands.length;
  const latenciesMs = new Float64Array(total);
  const status = new Uint8Array(total);
  const results: ScheduleWaybillResult[] | undefined = saveResults ? new Array(total) : undefined;
  const kinds: Record<string, number> = {};
  const messages: string[] = [];
  let next = 0;
  let completed = 0;
  let errors = 0;
  const start = performance.now();

  const worker = async (): Promise<void> => {
    for (;;) {
      const i = next++;
      if (i >= total) return;
      const t0 = performance.now();
      try {
        const r = await useCase.execute(commands[i]!);
        if (results) results[i] = r;
        status[i] = 1;
        completed++;
      } catch (error) {
        status[i] = 2;
        errors++;
        const kind = error instanceof Error ? error.name : typeof error;
        kinds[kind] = (kinds[kind] ?? 0) + 1;
        if (messages.length < 5) messages.push(String(error));
      }
      latenciesMs[i] = performance.now() - t0;
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, total) }, () => worker()));
  const result: PoolResult = {
    total,
    completed,
    errors,
    kinds,
    messages,
    seconds: (performance.now() - start) / 1000,
    latenciesMs,
    status,
  };
  if (results) result.results = results;
  return result;
}

/** Nearest-rank percentile over an already sorted array. */
export function percentile(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const k = Math.min(n - 1, Math.max(0, Math.ceil((p / 100) * n) - 1));
  return sorted[k]!;
}

export interface SummaryMs {
  n: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
}

export function summaryMs(values: Float64Array): SummaryMs {
  const sorted = Float64Array.from(values).sort();
  let max = 0;
  for (let i = 0; i < values.length; i++) {
    if (values[i]! > max) max = values[i]!;
  }
  return {
    n: values.length,
    p50: round(percentile(sorted, 50)),
    p95: round(percentile(sorted, 95)),
    p99: round(percentile(sorted, 99)),
    max: round(max),
  };
}

/** 95 % Wilson interval for a proportion k/n. */
export function wilsonInterval(k: number, n: number, z = 1.96): [number, number] {
  const p = k / n;
  const denominator = 1 + (z * z) / n;
  const center = (p + (z * z) / (2 * n)) / denominator;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / denominator;
  return [round(center - half, 5), round(center + half, 5)];
}

export function forceGc(): void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (typeof gc !== 'function') {
    throw new Error('global.gc no disponible: ejecuta con NODE_OPTIONS=--expose-gc (npm run prueba:estres)');
  }
  gc();
}

export function memory(): { heapUsed: number; rss: number } {
  const m = process.memoryUsage();
  return { heapUsed: m.heapUsed, rss: m.rss };
}

export const toMB = (bytes: number): number => round(bytes / 1048576, 1);

/** Samples RSS every RSS_INTERVAL_MS; returns the maximum observed. It only sees the loop when it is free. */
export function sampleRss(): { stop: () => number } {
  let maximum = process.memoryUsage.rss();
  const clock = setInterval(() => {
    const current = process.memoryUsage.rss();
    if (current > maximum) maximum = current;
  }, RSS_INTERVAL_MS);
  return {
    stop: () => {
      clearInterval(clock);
      return Math.max(maximum, process.memoryUsage.rss());
    },
  };
}

/** Event-loop delay (perf_hooks.monitorEventLoopDelay), in ms. */
export function measureDelay(): { stop: () => { p99: number; max: number; samples: number } } {
  const monitor = monitorEventLoopDelay({ resolution: RESOLUTION_DELAY_MS });
  monitor.enable();
  return {
    stop: () => {
      monitor.disable();
      return {
        p99: round(monitor.percentile(99) / 1e6),
        max: round(monitor.max / 1e6),
        samples: monitor.count,
      };
    },
  };
}

export interface AuditReport {
  present: number;
  absent: number;
  /** Status and date inconsistent with each other (AGENDADA without a date, or vice versa). */
  corrupt: number;
  /** Present waybills whose version is not exactly 1. */
  versionDistinctFromOne: number;
  /** Waybills whose status or date does not match the oracle. */
  distinctAppointment: number;
  /** Completed requests with no waybill in the store (should be 0). */
  okWithoutWaybill: number;
  /** Requests with an error but a waybill in the store (should be 0 in E5 pass 1). */
  errorWithWaybill: number;
}

/** Walks the commands against the real store and compares with the oracle. */
export async function runAudit(
  store: InMemoryWaybillRepository,
  commands: Command[],
  specifications: Map<string, CoverageSpecification>,
  status?: Uint8Array,
): Promise<AuditReport> {
  const a: AuditReport = {
    present: 0,
    absent: 0,
    corrupt: 0,
    versionDistinctFromOne: 0,
    distinctAppointment: 0,
    okWithoutWaybill: 0,
    errorWithWaybill: 0,
  };
  for (let i = 0; i < commands.length; i++) {
    const c = commands[i]!;
    const g = await store.find(TenantId.of(c.tenant), WaybillNumber.of(c.waybillNumber));
    if (g === null) {
      a.absent++;
      if (status?.[i] === 1) a.okWithoutWaybill++;
      continue;
    }
    a.present++;
    if (status?.[i] === 2) a.errorWithWaybill++;
    if (g.version !== 1) a.versionDistinctFromOne++;
    if ((g.status === 'AGENDADA') !== (g.appointmentDate !== null)) a.corrupt++;
    const spec = specifications.get(comboKey(c.tenant, c.city));
    if (!spec) throw new Error(`Sin especificación de cobertura para ${comboKey(c.tenant, c.city)}`);
    const expectedValue = expectedAppointment(TODAY_ISO, spec.days, spec.unavailable);
    if (expectedValue !== (g.appointmentDate?.toString() ?? null)) a.distinctAppointment++;
  }
  return a;
}

/** Counts unhandled rejections and uncaught exceptions while the test runs. */
export function watchErrors(): { count: { unhandledRejection: number; uncaughtException: number }; stop: () => void } {
  const count = { unhandledRejection: 0, uncaughtException: 0 };
  const onRejection = (): void => {
    count.unhandledRejection++;
  };
  const onException = (): void => {
    count.uncaughtException++;
  };
  process.on('unhandledRejection', onRejection);
  process.on('uncaughtException', onException);
  return {
    count,
    stop: () => {
      process.off('unhandledRejection', onRejection);
      process.off('uncaughtException', onException);
    },
  };
}

export function writeResult(name: string, data: unknown): void {
  mkdirSync(RESULTS, { recursive: true });
  writeFileSync(RESULTS + name, JSON.stringify(data, null, 2) + '\n');
}

export const log = (id: string, text: string): void => {
  console.log(`[${id}] ${text}`);
};

export const executionEnvironment = () => ({
  node: process.version,
  platform: process.platform,
  architecture: process.arch,
  exposedGc: typeof (globalThis as { gc?: unknown }).gc === 'function',
});

export { round };

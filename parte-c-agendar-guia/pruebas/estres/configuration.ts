/**
 * Configuration of the stress test. Every scale value comes from an environment variable with a
 * default value; an invalid value aborts with an error that names the variable.
 *
 *   STRESS_SEED               data seed (default 20261028)
 *   STRESS_BATCH_BASE         waybills in the E1 base batch (default 40000)
 *   STRESS_FACTOR             multiple of the base batch in E1 (default 3): E1 = FACTOR × BASE
 *   STRESS_BURST              simultaneous requests on the same waybill in E2 (default 10000)
 *   STRESS_DUP_GUIDES         distinct waybills in E3 (default 1000)
 *   STRESS_DUPLICATES         requests per waybill in E3 (default 50)
 *   STRESS_STEPS              E4 rungs, comma-separated, strictly increasing
 *                             (default 100,500,1000,5000,10000,20000,50000)
 *   STRESS_MAX_CONCURRENT     cap on requests in flight at once (default 50000)
 *   STRESS_RSS_LIMIT_MB       RSS limit: if exceeded in E4, the rungs are stopped (default 4096)
 *   STRESS_FAILURE_RATES      E5 failure rates, comma-separated, in (0, 1) (default 0.05,0.15,0.30)
 *   STRESS_FAILURE_GUIDES     waybills per rate in E5 (default 20000)
 *   STRESS_MEMORY_OPS         idempotent calls in E6b (default 1000000)
 *   STRESS_MEMORY_GUIDES      scheduled waybills over which the E6b calls are repeated (default 10000)
 *   STRESS_MEMORY_NEW_GUIDES  new waybills created in E6a (default 100000). Variable added to the original list.
 *   STRESS_MEMORY_STEP        every how many operations the heap is measured after gc() in E6b (default 100000).
 *                             Variable added to the original list.
 */

const read = (name: string): string | undefined => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return undefined;
  return raw.trim();
};

const toPositiveInteger = (name: string, text: string): number => {
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo; se recibió "${text}"`);
  }
  return value;
};

const positiveInteger = (name: string, fallback: number): number => {
  const text = read(name);
  return text === undefined ? fallback : toPositiveInteger(name, text);
};

const listOf = (name: string, fallback: string): string[] => {
  const text = read(name) ?? fallback;
  const parts = text.split(',').map((p) => p.trim());
  if (parts.some((p) => p === '')) throw new Error(`${name} contiene un valor vacío; se recibió "${text}"`);
  return parts;
};

const rungsOf = (name: string, fallback: string): number[] => {
  const values = listOf(name, fallback).map((p) => toPositiveInteger(name, p));
  for (let i = 1; i < values.length; i++) {
    if (values[i]! <= values[i - 1]!) {
      throw new Error(`${name} debe estar en orden estrictamente creciente; se recibió "${values.join(',')}"`);
    }
  }
  return values;
};

const ratesOf = (name: string, fallback: string): number[] =>
  listOf(name, fallback).map((p) => {
    const value = Number(p);
    if (!/^\d*\.?\d+$/.test(p) || !Number.isFinite(value) || value <= 0 || value >= 1) {
      throw new Error(`${name} debe contener tasas en el intervalo (0, 1); se recibió "${p}"`);
    }
    return value;
  });

export const CONFIG = {
  seedValue: positiveInteger('STRESS_SEED', 20261028),
  baseBatch: positiveInteger('STRESS_BATCH_BASE', 40000),
  factor: positiveInteger('STRESS_FACTOR', 3),
  burst: positiveInteger('STRESS_BURST', 10000),
  duplicateWaybills: positiveInteger('STRESS_DUP_GUIDES', 1000),
  duplicates: positiveInteger('STRESS_DUPLICATES', 50),
  rungs: rungsOf('STRESS_STEPS', '100,500,1000,5000,10000,20000,50000'),
  maxConcurrency: positiveInteger('STRESS_MAX_CONCURRENT', 50000),
  rssLimitMb: positiveInteger('STRESS_RSS_LIMIT_MB', 4096),
  failureRates: ratesOf('STRESS_FAILURE_RATES', '0.05,0.15,0.30'),
  waybillFailures: positiveInteger('STRESS_FAILURE_GUIDES', 20000),
  memoryOps: positiveInteger('STRESS_MEMORY_OPS', 1000000),
  memoryWaybills: positiveInteger('STRESS_MEMORY_GUIDES', 10000),
  newMemoryWaybills: positiveInteger('STRESS_MEMORY_NEW_GUIDES', 100000),
  memoryStep: positiveInteger('STRESS_MEMORY_STEP', 100000),
} as const;

if (CONFIG.memoryStep > CONFIG.memoryOps) {
  throw new Error(`STRESS_MEMORY_STEP (${CONFIG.memoryStep}) no puede superar STRESS_MEMORY_OPS (${CONFIG.memoryOps})`);
}

/** E1: FACTOR × BASE distinct waybills. */
export const BATCH_E1 = CONFIG.factor * CONFIG.baseBatch;

/** E4 rungs that fit within the concurrency cap. */
export const RUNGS = CONFIG.rungs.filter((n) => n <= CONFIG.maxConcurrency);
if (RUNGS.length === 0) {
  throw new Error(`Ningún escalón de STRESS_STEPS (${CONFIG.rungs.join(',')}) cabe en STRESS_MAX_CONCURRENT (${CONFIG.maxConcurrency})`);
}

/*
 * Specification parameters (not scale values): concurrency and simulated latency per operation
 * (waybill read, coverage read, and write), criteria thresholds, and a fixed "today".
 */
export const CONCURRENCY_E1 = 50;
export const LATENCY_E1_MS = 5;
export const LATENCY_E2_MS = 5;
export const LATENCY_E3_MS = 5;
export const LATENCY_E4_MS = 20;
export const LATENCY_E5_MS = 5;
export const CONCURRENCY_E5 = 50;
export const TODAY_ISO = '2026-10-28';
/** E4 breakpoint criterion: p99 latency above 5 times that of the first rung. */
export const BREAKPOINT_P99_THRESHOLD = 5;
/** E4 breakpoint criterion: event-loop delay p99 above this value (ms). */
export const DELAY_P99_THRESHOLD_MS = 1000;
/** RSS sampling during each E4 rung (ms). */
export const RSS_INTERVAL_MS = 100;
/** Event-loop delay monitor resolution (ms). */
export const RESOLUTION_DELAY_MS = 10;
/** E6b criterion: allowed heap growth = max(10 %, 20 MB). */
export const GROWTH_MARGIN = 0.1;
export const GROWTH_MARGIN_MIN_BYTES = 20 * 1024 * 1024;
/** Seed offset for the coverage repository failures (independent of the waybill one). */
export const COVERAGE_SEED_OFFSET = 7919;

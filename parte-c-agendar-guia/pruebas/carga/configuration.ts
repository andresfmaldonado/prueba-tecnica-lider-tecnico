/**
 * Scale and seed of the load test. Scale values come from environment variables with a default
 * value; any value that is not a positive integer aborts with a clear error.
 *
 *   LOAD_SEED            data seed (default 20261028)
 *   LOAD_BATCH_SIZE      waybills in the batch (default 40000)
 *   LOAD_BUDGET_SECONDS  time limit in seconds per C1 matrix combination (default 20)
 *   LOAD_OPEN_SECONDS    duration of each segment of the open-load test C4 (default 20)
 *   LOAD_TENANTS         number of tenants (default 30)
 */

function positiveInteger(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === '') return fallback;
  const text = raw.trim();
  const value = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} debe ser un entero positivo; se recibió "${raw}"`);
  }
  return value;
}

export const CONFIG = {
  seedValue: positiveInteger('LOAD_SEED', 20261028),
  batchSize: positiveInteger('LOAD_BATCH_SIZE', 40000),
  budgetSeconds: positiveInteger('LOAD_BUDGET_SECONDS', 20),
  openSegmentSeconds: positiveInteger('LOAD_OPEN_SECONDS', 20),
  tenants: positiveInteger('LOAD_TENANTS', 30),
} as const;

/*
 * Axes fixed by the campaign specification. They are not scale variables: changing them
 * changes the test, not its size.
 */
export const LATENCY_MATRIX_MS = [0, 5, 20, 100] as const;
export const CONCURRENCY_MATRIX = [1, 10, 50, 100] as const;
export const CONCURRENCY_BATCH = 50;
export const BATCH_LATENCY_MS = 20;
export const RESUME_LATENCY_MS = 5;
export const OPEN_PACES = [5, 50, 500] as const;
export const OPEN_LATENCY_MS = 20;
/** Fixed "today": the data and the oracle are reproducible. */
export const TODAY_ISO = '2026-10-28';
/** Two-hour window of the nightly batch, in seconds. */
export const BATCH_WINDOW_SECONDS = 2 * 3600;
/** Specification threshold: the minimum for 40,000 waybills in 2 h (used as-is: 5.6 req/s). */
export const MIN_REQ_S_BATCH = 5.6;
export const MIN_REQ_S_MATRIX = 50;
export const P99_PEAK_PACE_THRESHOLD_MS = 200;
export const BATCH_PEAK_PACE = 5;
/** Previous model from Part A (data from the brief): reference paces in waybills/s. */
export const MODEL_PART_A = { peakPace: 5, highPace: 50 } as const;

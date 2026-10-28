/**
 * C2: full batch run (LOAD_BATCH_SIZE waybills, concurrency 50, L = 20 ms, no time limit).
 * C5: memory before and after C2 (kept in the same file to measure the same run).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONCURRENCY_BATCH,
  CONFIG,
  BATCH_LATENCY_MS,
  MIN_REQ_S_BATCH,
  MODEL_PART_A,
  BATCH_WINDOW_SECONDS,
} from './configuration';
import { specificationKey, commandFor, runBatch, createWorld, memory, summary } from './common';
import { TenantId, WaybillNumber } from '../../src';

const RESULTS = fileURLToPath(new URL('./resultados/', import.meta.url));

const round = (x: number, d = 3) => Math.round(x * 10 ** d) / 10 ** d;

/** C2 state that C5 needs: memory is measured while the store is still alive. */
const c2: { memoryBefore?: { heapUsed: number; rss: number }; memoryAfter?: { heapUsed: number; rss: number }; waybills?: number } = {};

describe('C2 corrida completa del lote', () => {
  it('40.000 guías, concurrencia 50, L = 20 ms: tiempo, throughput y verificación del resultado', async () => {
    mkdirSync(RESULTS, { recursive: true });
    const world = createWorld({ readMs: BATCH_LATENCY_MS, writeMs: BATCH_LATENCY_MS });
    c2.memoryBefore = memory();
    const r = await runBatch({ useCase: world.useCase, total: CONFIG.batchSize, concurrency: CONCURRENCY_BATCH });
    c2.memoryAfter = memory();
    c2.waybills = r.completed;

    // Verification: all AGENDADA with the appointment the oracle dictates, version 1, no extra writes.
    let scheduled = 0;
    let noCoverage = 0;
    let versionGreaterThanOne = 0;
    let distinctOracleDates = 0;
    let inconsistent = 0;
    for (let i = 0; i < CONFIG.batchSize; i++) {
      const c = commandFor(i);
      const g = await world.waybillsStore.find(TenantId.of(c.tenant), WaybillNumber.of(c.waybillNumber));
      if (!g) continue;
      if (g.status === 'AGENDADA') scheduled++;
      if (g.status === 'SIN_COBERTURA') noCoverage++;
      if (g.version > 1) versionGreaterThanOne++;
      if ((g.status === 'AGENDADA') !== (g.appointmentDate !== null)) inconsistent++;
      const spec = world.specifications.get(specificationKey(c.tenant, c.city));
      if (!spec || (spec.appointment ?? null) !== (g.appointmentDate?.toString() ?? null)) distinctOracleDates++;
    }

    const reqS = r.completed / r.seconds;
    const extrapolatedHours40k = CONFIG.batchSize / reqS / 3600;
    const result = {
      testRun: 'C2 corrida completa del lote',
      configuration: { waybills: CONFIG.batchSize, concurrency: CONCURRENCY_BATCH, latency_ms: BATCH_LATENCY_MS },
      completed: r.completed,
      errors: r.errors,
      error_messages: r.errorMessages,
      seconds: round(r.seconds),
      minutes: round(r.seconds / 60),
      req_s: round(reqS, 2),
      repository_calls: world.callTimes.length,
      call_latency_ms: summary(world.callTimes),
      waybill_latency_ms: summary(r.waybillLatenciesMs),
      actual_writes: world.waybillsStore.writes,
      verification: {
        scheduled,
        no_coverage: noCoverage,
        version_greater_than_1: versionGreaterThanOne,
        inconsistent_status_date: inconsistent,
        distinct_oracle_dates: distinctOracleDates,
      },
      comparison: {
        batch_window_seconds: BATCH_WINDOW_SECONDS,
        margin_vs_2h_times: round(BATCH_WINDOW_SECONDS / r.seconds, 2),
        threshold_req_s: MIN_REQ_S_BATCH,
        meets_threshold: reqS >= MIN_REQ_S_BATCH,
        // Extrapolation (not measured): time for 40,000 waybills at the Part A model paces.
        model_part_a_hours_at_5_req_s_extrapolated: round(CONFIG.batchSize / MODEL_PART_A.peakPace / 3600, 3),
        model_part_a_minutes_at_50_req_s_extrapolated: round(CONFIG.batchSize / MODEL_PART_A.highPace / 60, 2),
        hours_with_extrapolated_throughput: round(extrapolatedHours40k, 3),
      },
    };
    console.log(`[C2] ${JSON.stringify(result)}`);
    writeFileSync(`${RESULTS}c2-lote.json`, JSON.stringify(result, null, 2));

    expect(r.errors).toBe(0);
    expect(r.completed).toBe(CONFIG.batchSize);
    expect(world.waybillsStore.writes).toBe(CONFIG.batchSize);
    expect(verificationOk(result.verification)).toBe(true);
    expect(reqS).toBeGreaterThanOrEqual(MIN_REQ_S_BATCH);
  }, 900_000);
});

function verificationOk(v: { no_coverage: number; version_greater_than_1: number; inconsistent_status_date: number; distinct_oracle_dates: number; scheduled: number }): boolean {
  return v.scheduled === CONFIG.batchSize && v.no_coverage === 0 && v.version_greater_than_1 === 0 && v.inconsistent_status_date === 0 && v.distinct_oracle_dates === 0;
}

describe('C5 memoria antes y después de C2', () => {
  it('heapUsed y rss antes/después, y bytes aproximados por guía almacenada', () => {
    mkdirSync(RESULTS, { recursive: true });
    expect(c2.memoryBefore, 'C2 debe haberse ejecutado antes').toBeDefined();
    const before = c2.memoryBefore!;
    const after = c2.memoryAfter!;
    const deltaHeap = after.heapUsed - before.heapUsed;
    const deltaRss = after.rss - before.rss;
    const result = {
      testRun: 'C5 memoria',
      note: 'Aproximado: sin forzar el recolector (no se usa --expose-gc); la variación incluye basura pendiente de recoger.',
      stored_waybills: c2.waybills,
      heap_used_mb: { before: round(before.heapUsed / 1048576, 2), after: round(after.heapUsed / 1048576, 2) },
      rss_mb: { before: round(before.rss / 1048576, 2), after: round(after.rss / 1048576, 2) },
      bytes_heap_per_waybill_approx: Math.round(deltaHeap / (c2.waybills ?? 1)),
      bytes_rss_per_waybill_approx: Math.round(deltaRss / (c2.waybills ?? 1)),
    };
    console.log(`[C5] ${JSON.stringify(result)}`);
    writeFileSync(`${RESULTS}c5-memoria.json`, JSON.stringify(result, null, 2));
    expect(Number.isFinite(result.bytes_heap_per_waybill_approx)).toBe(true);
  });
});

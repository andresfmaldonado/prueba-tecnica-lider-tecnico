/** C1: closed-load matrix, simulated latency × concurrency (16 combinations). */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONFIG, CONCURRENCY_MATRIX, LATENCY_MATRIX_MS, MIN_REQ_S_MATRIX } from './configuration';
import { runBatch, createWorld, memory, summary, TENANTS } from './common';

const RESULTS = fileURLToPath(new URL('./resultados/', import.meta.url));

describe('C1 matriz de carga cerrada', () => {
  it('16 combinaciones: throughput, latencia por llamada, errores y escrituras', async () => {
    mkdirSync(RESULTS, { recursive: true });
    const rows: Record<string, unknown>[] = [];

    for (const latencyMs of LATENCY_MATRIX_MS) {
      for (const concurrency of CONCURRENCY_MATRIX) {
        const world = createWorld({ readMs: latencyMs, writeMs: latencyMs });
        const before = memory();
        const r = await runBatch({
          useCase: world.useCase,
          total: CONFIG.batchSize,
          concurrency,
          limitMs: CONFIG.budgetSeconds * 1000,
        });
        const after = memory();
        const writes = world.waybillsStore.writes;
        const reqS = r.completed / r.seconds;
        const callsS = world.callTimes.length / r.seconds;
        const row = {
          latency_ms: latencyMs,
          concurrency,
          completed: r.completed,
          launched: r.launched,
          cap_reached: r.completed < CONFIG.batchSize,
          seconds: Math.round(r.seconds * 1000) / 1000,
          req_s: Math.round(reqS * 100) / 100,
          calls_s: Math.round(callsS * 100) / 100,
          repository_calls: world.callTimes.length,
          call_latency_ms: summary(world.callTimes),
          waybill_latency_ms: summary(r.waybillLatenciesMs),
          errors: r.errors,
          error_messages: r.errorMessages,
          actual_writes: writes,
          writes_equal_completed: writes === r.completed,
          heap_delta_mb: Math.round(((after.heapUsed - before.heapUsed) / 1048576) * 100) / 100,
          meets_throughput:
            concurrency >= 10 && latencyMs <= 20 ? reqS >= MIN_REQ_S_MATRIX : null,
        };
        rows.push(row);
        console.log(
          `[C1] L=${latencyMs}ms c=${concurrency} completadas=${r.completed} seg=${row.seconds} ` +
            `req/s=${row.req_s} llamadas/s=${row.calls_s} p50=${row.call_latency_ms.p50} ` +
            `p95=${row.call_latency_ms.p95} p99=${row.call_latency_ms.p99} max=${row.call_latency_ms.max} ` +
            `errores=${r.errors} escrituras=${writes} heapΔMB=${row.heap_delta_mb}`,
        );
      }
    }

    writeFileSync(
      `${RESULTS}matriz.json`,
      JSON.stringify(
        {
          testRun: 'C1 matriz de carga cerrada',
          configuration: {
            seedValue: CONFIG.seedValue,
            batch_size: CONFIG.batchSize,
            budget_seconds: CONFIG.budgetSeconds,
            tenants: TENANTS.length,
            cities: 12,
            threshold_req_s: MIN_REQ_S_MATRIX,
          },
          rows,
        },
        null,
        2,
      ),
    );

    for (const f of rows) {
      expect(f.errors, `errores en L=${f.latency_ms} c=${f.concurrency}`).toBe(0);
      expect(f.writes_equal_completed, `escrituras en L=${f.latency_ms} c=${f.concurrency}`).toBe(true);
      if (f.meets_throughput !== null) {
        expect(f.meets_throughput, `throughput en L=${f.latency_ms} c=${f.concurrency}`).toBe(true);
      }
    }
  }, 900_000);
});

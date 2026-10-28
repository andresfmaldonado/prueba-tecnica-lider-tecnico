/**
 * E1 Volume 3x: FACTOR × BASE distinct waybills, concurrency 50, L = 5 ms per operation.
 * Expected: exact real writes = waybills, 0 errors, 0 inconsistencies with the oracle.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONCURRENCY_E1, CONFIG, LATENCY_E1_MS, BATCH_E1 } from './configuration';
import {
  toMB,
  runAudit,
  commandFor,
  runPool,
  createData,
  executionEnvironment,
  writeResult,
  forceGc,
  log,
  memory,
  assemble,
  summaryMs,
  watchErrors,
} from './common';

const watch = watchErrors();
afterAll(() => {
  const c = watch.count;
  watch.stop();
  expect(c.unhandledRejection + c.uncaughtException).toBe(0);
});

describe('E1 volumen 3x', () => {
  it(`${BATCH_E1} guías distintas, concurrencia ${CONCURRENCY_E1}, L=${LATENCY_E1_MS} ms`, async () => {
    const data = createData();
    const m = assemble(data, { readMs: LATENCY_E1_MS, writeMs: LATENCY_E1_MS });
    const commands = Array.from({ length: BATCH_E1 }, (_, i) => commandFor(i));
    const distinctItems = new Set(commands.map((c) => `${c.tenant}|${c.waybillNumber}`)).size;

    forceGc();
    const before = memory();
    const r = await runPool(m.useCase, commands, CONCURRENCY_E1);
    const afterBatch = memory();
    forceGc();
    const afterGc = memory();

    const audit = await runAudit(data.waybillsStore, commands, data.specifications);
    const writes = data.waybillsStore.writes;
    const throughput = r.completed / r.seconds;
    const latency = summaryMs(r.latenciesMs);

    log(
      'E1',
      `guías=${BATCH_E1} (distintas=${distinctItems}) concurrencia=${CONCURRENCY_E1} L=${LATENCY_E1_MS} ms`,
    );
    log(
      'E1',
      `tiempo=${r.seconds.toFixed(2)} s throughput=${throughput.toFixed(1)} guías/s completadas=${r.completed} errores=${r.errors}`,
    );
    log(
      'E1',
      `escrituras reales=${writes} intentos de escritura=${m.waybills.writes} lecturas guía=${m.waybills.reads} lecturas cobertura=${m.coverages.reads}`,
    );
    log(
      'E1',
      `auditoría: presentes=${audit.present} ausentes=${audit.absent} corruptas=${audit.corrupt} versión≠1=${audit.versionDistinctFromOne} distintas del oráculo=${audit.distinctAppointment}`,
    );
    log(
      'E1',
      `heap antes=${toMB(before.heapUsed)} MB, tras lote=${toMB(afterBatch.heapUsed)} MB, tras gc=${toMB(afterGc.heapUsed)} MB; rss antes=${toMB(before.rss)} MB, tras lote=${toMB(afterBatch.rss)} MB`,
    );
    log('E1', `latencia por solicitud (ms): p50=${latency.p50} p95=${latency.p95} p99=${latency.p99} máx=${latency.max}`);

    writeResult('e1-volumen.json', {
      testRun: 'E1 volumen 3x',
      environment: executionEnvironment(),
      configuration: {
        waybills: BATCH_E1,
        factor: CONFIG.factor,
        baseBatch: CONFIG.baseBatch,
        concurrency: CONCURRENCY_E1,
        latencyPerOperationMs: LATENCY_E1_MS,
      },
      distinctWaybills: distinctItems,
      completed: r.completed,
      errors: r.errors,
      kinds: r.kinds,
      seconds: Number(r.seconds.toFixed(3)),
      waybillsPerSecond: Number(throughput.toFixed(2)),
      actual_writes: writes,
      write_attempts: m.waybills.writes,
      waybill_reads: m.waybills.reads,
      coverage_reads: m.coverages.reads,
      version_conflicts: m.counted.conflicts,
      request_latency_ms: latency,
      memory: {
        before,
        postBatch: afterBatch,
        postGc: afterGc,
      },
      auditReport: audit,
    });

    expect(r.errors).toBe(0);
    expect(distinctItems).toBe(BATCH_E1);
    expect(writes).toBe(BATCH_E1);
    expect(audit.present).toBe(BATCH_E1);
    expect(audit.corrupt + audit.versionDistinctFromOne + audit.distinctAppointment).toBe(0);
  }, 900_000);
});

/**
 * E3 Mixed contention: STRESS_DUP_GUIDES waybills × STRESS_DUPLICATES duplicate requests, all in
 * flight at once (up to STRESS_MAX_CONCURRENT), L = 5 ms.
 * Expected: exact real writes = waybills, version 1 for all, 0 errors, same response per waybill.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { TenantId, WaybillNumber } from '../../src';
import { CONFIG, LATENCY_E3_MS } from './configuration';
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

describe('E3 contención mixta', () => {
  it(`${CONFIG.duplicateWaybills} guías × ${CONFIG.duplicates} duplicados, todos en vuelo, L=${LATENCY_E3_MS} ms`, async () => {
    const waybills = CONFIG.duplicateWaybills;
    const duplicates = CONFIG.duplicates;
    const unique = Array.from({ length: waybills }, (_, g) => commandFor(g));
    // Index g × duplicates + d: the duplicates of a waybill stay contiguous.
    const commands = Array.from({ length: waybills * duplicates }, (_, k) => unique[Math.floor(k / duplicates)]!);
    const concurrency = Math.min(CONFIG.maxConcurrency, commands.length);

    const data = createData();
    const m = assemble(data, { readMs: LATENCY_E3_MS, writeMs: LATENCY_E3_MS });

    forceGc();
    const before = memory();
    const r = await runPool(m.useCase, commands, concurrency, true);
    const after = memory();

    const results = r.results ?? [];
    let distinctResponsesPerWaybill = 0;
    for (let g = 0; g < waybills; g++) {
      const first = results[g * duplicates];
      const key = `${first?.status}|${first?.appointmentDate}`;
      for (let d = 1; d < duplicates; d++) {
        const x = results[g * duplicates + d];
        if (`${x?.status}|${x?.appointmentDate}` !== key) {
          distinctResponsesPerWaybill++;
          break;
        }
      }
    }

    const audit = await runAudit(data.waybillsStore, unique, data.specifications);
    const latency = summaryMs(r.latenciesMs);

    // Explains the coverage reads. Every first attempt reads the coverage (all duplicates see the waybill
    // as pending). A retry reads the coverage again only if the waybill is still not scheduled, that is,
    // when it ended up SIN_COBERTURA. Each such waybill has duplicates − 1 retries.
    let noCoverageWaybills = 0;
    for (const c of unique) {
      const w = await data.waybillsStore.find(TenantId.of(c.tenant), WaybillNumber.of(c.waybillNumber));
      if (w?.status === 'SIN_COBERTURA') noCoverageWaybills++;
    }
    const predictedCoverageReads = commands.length + (duplicates - 1) * noCoverageWaybills;
    log(
      'E3',
      `lecturas de cobertura=${m.coverages.reads} predicción=${predictedCoverageReads} = ${commands.length} primeros intentos + ${duplicates - 1} reintentos × ${noCoverageWaybills} guías SIN_COBERTURA`,
    );

    log('E3', `guías=${waybills} duplicados=${duplicates} solicitudes=${commands.length} en vuelo=${concurrency} L=${LATENCY_E3_MS} ms`);
    log('E3', `tiempo=${r.seconds.toFixed(2)} s completadas=${r.completed} errores=${r.errors} tipos=${JSON.stringify(r.kinds)}`);
    log('E3', `escrituras reales=${data.waybillsStore.writes} intentos de escritura=${m.waybills.writes} conflictos de versión=${m.counted.conflicts}`);
    log('E3', `auditoría: presentes=${audit.present} versión≠1=${audit.versionDistinctFromOne} corruptas=${audit.corrupt} distintas del oráculo=${audit.distinctAppointment}`);
    log('E3', `guías con respuestas distintas entre duplicados=${distinctResponsesPerWaybill}`);
    log('E3', `latencia por solicitud (ms): p50=${latency.p50} p95=${latency.p95} p99=${latency.p99} máx=${latency.max}`);
    log('E3', `heap antes=${toMB(before.heapUsed)} MB después=${toMB(after.heapUsed)} MB rss después=${toMB(after.rss)} MB`);

    writeResult('e3-contencion.json', {
      testRun: 'E3 contención mixta',
      environment: executionEnvironment(),
      configuration: {
        waybills,
        duplicates,
        requests: commands.length,
        inFlight: concurrency,
        latencyPerOperationMs: LATENCY_E3_MS,
      },
      completed: r.completed,
      errors: r.errors,
      kinds: r.kinds,
      seconds: Number(r.seconds.toFixed(3)),
      actual_writes: data.waybillsStore.writes,
      write_attempts: m.waybills.writes,
      waybill_reads: m.waybills.reads,
      coverage_reads: m.coverages.reads,
      coverage_reads_predicted: predictedCoverageReads,
      waybills_without_coverage: noCoverageWaybills,
      version_conflicts: m.counted.conflicts,
      waybills_with_distinct_responses: distinctResponsesPerWaybill,
      request_latency_ms: latency,
      memory: { before, after },
      auditReport: audit,
    });

    expect(r.errors).toBe(0);
    expect(data.waybillsStore.writes).toBe(waybills);
    expect(audit.present).toBe(waybills);
    expect(audit.versionDistinctFromOne + audit.corrupt + audit.distinctAppointment).toBe(0);
    expect(distinctResponsesPerWaybill).toBe(0);
  }, 900_000);
});

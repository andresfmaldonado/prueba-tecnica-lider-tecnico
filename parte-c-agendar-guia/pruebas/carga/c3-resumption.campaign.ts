/**
 * C3: resumption after a crash. First pass: stop launching waybills once 50 % is reached (those
 * in flight finish). Second pass: ALL waybills are processed from scratch, as when the batch restarts.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { CONCURRENCY_BATCH, CONFIG, RESUME_LATENCY_MS } from './configuration';
import { specificationKey, commandFor, runBatch, createWorld } from './common';
import { WaybillNumber, TenantId } from '../../src';

const RESULTS = fileURLToPath(new URL('./resultados/', import.meta.url));

describe('C3 reanudación exacta tras caída', () => {
  it('las escrituras totales son exactamente el tamaño del lote y el estado final es coherente', async () => {
    mkdirSync(RESULTS, { recursive: true });
    const N = CONFIG.batchSize;
    const world = createWorld({ readMs: RESUME_LATENCY_MS, writeMs: RESUME_LATENCY_MS });
    const store = world.waybillsStore;

    // First pass: launching stops at 50 %; waybills in flight finish.
    const pass1 = await runBatch({
      useCase: world.useCase,
      total: N,
      concurrency: CONCURRENCY_BATCH,
      stopAfterCompleted: Math.floor(N / 2),
    });
    const writesAfterPass1 = store.writes;
    const completed1 = pass1.completed;
    let presentAfterPass1 = 0;
    for (let i = 0; i < N; i++) {
      const c = commandFor(i);
      if (await store.find(TenantId.of(c.tenant), WaybillNumber.of(c.waybillNumber))) presentAfterPass1++;
    }

    // Second pass: the whole batch from scratch, same store (the database survives the crash).
    const pass2 = await runBatch({ useCase: world.useCase, total: N, concurrency: CONCURRENCY_BATCH });
    const writesPass2 = store.writes - writesAfterPass1;
    const totalWrites = store.writes;

    // Verification of the final state, waybill by waybill.
    let present = 0;
    let versionGreaterThanOne = 0;
    let inconsistent = 0;
    let scheduled = 0;
    let distinctOracleDates = 0;
    let noCoverage = 0;
    let versionOneOrUnwritten = 0;
    for (let i = 0; i < N; i++) {
      const c = commandFor(i);
      const g = await store.find(TenantId.of(c.tenant), WaybillNumber.of(c.waybillNumber));
      if (!g) continue;
      present++;
      if (g.version > 1) versionGreaterThanOne++;
      if ((g.status === 'AGENDADA') !== (g.appointmentDate !== null)) inconsistent++;
      if (g.status === 'AGENDADA') scheduled++;
      if (g.status === 'SIN_COBERTURA') noCoverage++;
      if (g.version === 1) versionOneOrUnwritten++;
      const spec = world.specifications.get(specificationKey(c.tenant, c.city));
      if (!spec || (spec.appointment ?? null) !== (g.appointmentDate?.toString() ?? null)) distinctOracleDates++;
    }

    const result = {
      testRun: 'C3 reanudación tras caída',
      configuration: { waybills: N, concurrency: CONCURRENCY_BATCH, latency_ms: RESUME_LATENCY_MS },
      pass1: {
        completed: completed1,
        launched: pass1.launched,
        errors: pass1.errors,
        writes: writesAfterPass1,
        seconds: Math.round(pass1.seconds * 1000) / 1000,
        percent_completed: Math.round((completed1 / N) * 10000) / 100,
      },
      pass2: {
        completed: pass2.completed,
        errors: pass2.errors,
        writes: writesPass2,
        expected_writes_N_minus_completed1: N - completed1,
        seconds: Math.round(pass2.seconds * 1000) / 1000,
      },
      totals: {
        actual_writes: totalWrites,
        expected_writes: N,
        waybills_present_after_pass1: presentAfterPass1,
        waybills_present_at_end: present,
      },
      verification: {
        version_greater_than_1: versionGreaterThanOne,
        version_1: versionOneOrUnwritten,
        inconsistent_status_date: inconsistent,
        scheduled,
        no_coverage: noCoverage,
        distinct_oracle_dates: distinctOracleDates,
      },
    };
    console.log(`[C3] ${JSON.stringify(result)}`);
    writeFileSync(`${RESULTS}c3-reanudacion.json`, JSON.stringify(result, null, 2));

    expect(pass1.errors + pass2.errors).toBe(0);
    expect(totalWrites, 'escrituras totales = tamaño del lote').toBe(N);
    expect(writesPass2, 'escrituras de la segunda pasada = N - completadas de la primera').toBe(N - completed1);
    expect(presentAfterPass1, 'tras la primera pasada existen solo las completadas').toBe(completed1);
    expect(present, 'al final existen las N guías').toBe(N);
    expect(versionGreaterThanOne, 'ninguna guía con versión > 1').toBe(0);
    expect(inconsistent, 'AGENDADA si y solo si hay fecha').toBe(0);
    expect(distinctOracleDates, 'fechas iguales al oráculo').toBe(0);
    expect(scheduled).toBe(N);
  }, 900_000);
});

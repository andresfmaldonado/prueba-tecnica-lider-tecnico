/**
 * E2 Burst on the SAME waybill: STRESS_BURST simultaneous requests, L = 5 ms.
 * Expected: all return the same appointment, real writes = 1, 0 errors, version 1.
 *
 * Declared simplification: the burst's city gets Monday-to-Friday coverage with no closures,
 * so that the appointment exists and can be compared with the oracle.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { WaybillNumber, TenantId } from '../../src';
import { CITIES, TENANTS } from '../_comun/data';
import { expectedAppointment } from '../_comun/oracle';
import { CONFIG, TODAY_ISO, LATENCY_E2_MS } from './configuration';
import {
  toMB,
  runPool,
  createData,
  defineCoverage,
  executionEnvironment,
  writeResult,
  forceGc,
  log,
  memory,
  assemble,
  summaryMs,
  watchErrors,
  type Command,
} from './common';

const watch = watchErrors();
afterAll(() => {
  const c = watch.count;
  watch.stop();
  expect(c.unhandledRejection + c.uncaughtException).toBe(0);
});

describe('E2 ráfaga sobre la misma guía', () => {
  it(`${CONFIG.burst} solicitudes simultáneas sobre una guía, L=${LATENCY_E2_MS} ms`, async () => {
    const data = createData();
    const tenant = TENANTS[0]!;
    const city = CITIES[0]!;
    const coverage = { days: [1, 2, 3, 4, 5], unavailable: [] as string[] };
    defineCoverage(data, tenant, city, coverage);
    const expectedValue = expectedAppointment(TODAY_ISO, coverage.days, coverage.unavailable);

    const command: Command = { tenant, city, waybillNumber: 'G-RAFAGA-000001' };
    const commands = Array.from({ length: CONFIG.burst }, () => command);
    const m = assemble(data, { readMs: LATENCY_E2_MS, writeMs: LATENCY_E2_MS });

    forceGc();
    const before = memory();
    const r = await runPool(m.useCase, commands, CONFIG.maxConcurrency, true);
    const after = memory();

    const results = r.results ?? [];
    const distinct = new Set(results.map((x) => `${x.status}|${x.appointmentDate}`));
    const waybill = await data.waybillsStore.find(TenantId.of(tenant), WaybillNumber.of(command.waybillNumber));
    const latency = summaryMs(r.latenciesMs);
    const conflicts = m.counted.conflicts;

    log('E2', `solicitudes=${CONFIG.burst} sobre una guía, L=${LATENCY_E2_MS} ms, todas en vuelo a la vez`);
    log('E2', `tiempo=${r.seconds.toFixed(3)} s completadas=${r.completed} errores=${r.errors}`);
    log('E2', `escrituras reales=${data.waybillsStore.writes} intentos de escritura=${m.waybills.writes} conflictos de versión=${conflicts}`);
    log('E2', `respuestas distintas=${distinct.size} (${[...distinct].join(' ; ')}) oráculo=AGENDADA|${expectedValue}`);
    log('E2', `versión final=${waybill?.version} estado final=${waybill?.status} cita final=${waybill?.appointmentDate?.toString() ?? null}`);
    log('E2', `latencia por solicitud (ms): p50=${latency.p50} p95=${latency.p95} p99=${latency.p99} máx=${latency.max}`);
    log('E2', `heap antes=${toMB(before.heapUsed)} MB después=${toMB(after.heapUsed)} MB`);

    writeResult('e2-rafaga.json', {
      testRun: 'E2 ráfaga sobre la misma guía',
      environment: executionEnvironment(),
      configuration: { requests: CONFIG.burst, latencyPerOperationMs: LATENCY_E2_MS, concurrency: 'todas en vuelo' },
      simplification: 'coberturas de lunes a viernes sin cierres para la ciudad de la ráfaga',
      completed: r.completed,
      errors: r.errors,
      kinds: r.kinds,
      seconds: Number(r.seconds.toFixed(4)),
      actual_writes: data.waybillsStore.writes,
      write_attempts: m.waybills.writes,
      waybill_reads: m.waybills.reads,
      version_conflicts: conflicts,
      expected_conflicts_if_all_read_before_first_write: CONFIG.burst - 1,
      distinct_responses: [...distinct],
      oracle: `AGENDADA|${expectedValue}`,
      final_version: waybill?.version ?? null,
      request_latency_ms: latency,
      memory: { before, after },
    });

    expect(r.errors).toBe(0);
    expect(distinct.size).toBe(1);
    expect([...distinct][0]).toBe(`AGENDADA|${expectedValue}`);
    expect(data.waybillsStore.writes).toBe(1);
    expect(waybill?.version).toBe(1);
  }, 900_000);
});

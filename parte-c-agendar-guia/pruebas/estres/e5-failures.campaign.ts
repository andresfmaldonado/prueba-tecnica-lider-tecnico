/**
 * E5 Injected failures: for each rate in STRESS_FAILURE_RATES, STRESS_FAILURE_GUIDES waybills,
 * concurrency 50, L = 5 ms, with failureRate applied to reads and writes.
 *
 * Pass 1: the failures are InjectedError, leave no corrupt waybills, and the failed-call rate is
 * compared with 1 − (1 − p)^3 (three operations per call: waybill read, coverage read, and write).
 * Pass 2 (resumption): ALL waybills are reprocessed without failures; at the end real writes = waybills.
 */
import { afterAll, describe, expect, it } from 'vitest';
import { CONCURRENCY_E5, CONFIG, LATENCY_E5_MS } from './configuration';
import {
  toMB,
  runAudit,
  commandFor,
  runPool,
  createData,
  executionEnvironment,
  writeResult,
  forceGc,
  wilsonInterval,
  log,
  memory,
  assemble,
  watchErrors,
} from './common';

const watch = watchErrors();
afterAll(() => {
  const c = watch.count;
  watch.stop();
  expect(c.unhandledRejection + c.uncaughtException).toBe(0);
});

const results: Record<string, unknown>[] = [];

describe('E5 fallos inyectados y reanudación', () => {
  for (const p of CONFIG.failureRates) {
    it(`tasa ${p}: ${CONFIG.waybillFailures} guías, concurrencia ${CONCURRENCY_E5}, L=${LATENCY_E5_MS} ms`, async () => {
      const waybills = CONFIG.waybillFailures;
      const commands = Array.from({ length: waybills }, (_, i) => commandFor(i));
      const data = createData();

      // Pass 1: with injected failures.
      const m1 = assemble(data, { readMs: LATENCY_E5_MS, writeMs: LATENCY_E5_MS, failureRate: p });
      forceGc();
      const before = memory();
      const r1 = await runPool(m1.useCase, commands, CONCURRENCY_E5);
      const audit1 = await runAudit(data.waybillsStore, commands, data.specifications, r1.status);
      const writes1 = data.waybillsStore.writes;
      const onlyInjected = Object.keys(r1.kinds).every((t) => t === 'InjectedError');
      const attemptedOperations = m1.waybills.reads + m1.waybills.writes + m1.coverages.reads;
      const operationFailures = m1.waybills.failures + m1.coverages.failures;

      const observedValue = r1.errors / waybills;
      const theoretical = 1 - (1 - p) ** 3;
      const [icLow, icHigh] = wilsonInterval(r1.errors, waybills);

      // Pass 2: resumption without failures over all waybills.
      const m2 = assemble(data, { readMs: LATENCY_E5_MS, writeMs: LATENCY_E5_MS, failureRate: 0 });
      const r2 = await runPool(m2.useCase, commands, CONCURRENCY_E5);
      const after = memory();
      const audit2 = await runAudit(data.waybillsStore, commands, data.specifications);
      const writes2 = data.waybillsStore.writes - writes1;
      const totalWrites = data.waybillsStore.writes;

      log(
        'E5',
        `tasa=${p} guías=${waybills} pasada 1: completadas=${r1.completed} fallidas=${r1.errors} tipos=${JSON.stringify(r1.kinds)}`,
      );
      log(
        'E5',
        `tasa=${p} llamadas fallidas observada=${(observedValue * 100).toFixed(2)} % IC95 [${(icLow * 100).toFixed(2)}, ${(icHigh * 100).toFixed(2)}] % teórica 1-(1-p)^3=${(theoretical * 100).toFixed(2)} %`,
      );
      log(
        'E5',
        `tasa=${p} operaciones intentadas=${attemptedOperations} fallos por operación=${operationFailures} (${((operationFailures / attemptedOperations) * 100).toFixed(2)} %, teórico p=${(p * 100).toFixed(2)} %)`,
      );
      log(
        'E5',
        `tasa=${p} pasada 1 auditoría: presentes=${audit1.present} ausentes=${audit1.absent} corruptas=${audit1.corrupt} versión≠1=${audit1.versionDistinctFromOne} distintas del oráculo=${audit1.distinctAppointment} ok sin guía=${audit1.okWithoutWaybill} error con guía=${audit1.errorWithWaybill}`,
      );
      log(
        'E5',
        `tasa=${p} pasada 2 (reanudación): completadas=${r2.completed} errores=${r2.errors} escrituras en pasada 2=${writes2} escrituras totales=${totalWrites} presentes=${audit2.present} corruptas=${audit2.corrupt} versión≠1=${audit2.versionDistinctFromOne} distintas del oráculo=${audit2.distinctAppointment}`,
      );

      results.push({
        failureRate: p,
        waybills,
        pass1: {
          completed: r1.completed,
          failed: r1.errors,
          kinds: r1.kinds,
          messages: r1.messages,
          actual_writes: writes1,
          attempted_operations: attemptedOperations,
          failures_per_operation: operationFailures,
          observed_call_rate: Number(observedValue.toFixed(5)),
          theoretical_call_rate: Number(theoretical.toFixed(5)),
          ic95_observed: [icLow, icHigh],
          auditReport: audit1,
        },
        pass2: {
          completed: r2.completed,
          errors: r2.errors,
          writes_in_pass: writes2,
          total_writes: totalWrites,
          auditReport: audit2,
        },
        memory: { before, after },
      });
      writeResult('e5-fallos.json', {
        testRun: 'E5 fallos inyectados y reanudación',
        environment: executionEnvironment(),
        configuration: {
          waybills,
          concurrency: CONCURRENCY_E5,
          latencyPerOperationMs: LATENCY_E5_MS,
          rates: CONFIG.failureRates,
        },
        theoretical_note:
          'Tasa de llamadas fallidas teórica 1-(1-p)^3: supone tres operaciones independientes por llamada. Una llamada falla si falla alguna de las operaciones que intenta; el orden en que se intentan no cambia esa probabilidad, pero sí el número medio de operaciones intentadas.',
        results,
      });

      expect(onlyInjected, `tipos de error: ${JSON.stringify(r1.kinds)}`).toBe(true);
      expect(audit1.corrupt + audit1.versionDistinctFromOne + audit1.distinctAppointment).toBe(0);
      expect(audit1.okWithoutWaybill + audit1.errorWithWaybill).toBe(0);
      expect(writes1).toBe(r1.completed);
      expect(r2.errors).toBe(0);
      expect(writes2).toBe(r1.errors);
      expect(totalWrites).toBe(waybills);
      expect(audit2.present).toBe(waybills);
      expect(audit2.corrupt + audit2.versionDistinctFromOne + audit2.distinctAppointment).toBe(0);
    }, 900_000);
  }
});

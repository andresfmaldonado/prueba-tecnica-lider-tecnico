/**
 * E6 Memory and leaks.
 * (a) Creates STRESS_MEMORY_NEW_GUIDES new waybills after gc() and estimates bytes per waybill
 *     (heap after gc() − heap before, divided by the waybills).
 * (b) STRESS_MEMORY_OPS idempotent calls (L = 0) over STRESS_MEMORY_GUIDES already-scheduled
 *     waybills; gc() and heapUsed every STRESS_MEMORY_STEP operations.
 * Criterion: the heap after gc() between the 100,000-operation and 1,000,000-operation marks
 * (defaults) grows by at most max(10 %, 20 MB).
 *
 * For (b) the use case is used with the simulated repository, without the wrapper that records
 * times per call (that wrapper accumulates an array entry per call and would contaminate the measurement).
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  CONFIG,
  GROWTH_MARGIN,
  GROWTH_MARGIN_MIN_BYTES,
} from './configuration';
import {
  toMB,
  runAudit,
  commandFor,
  createData,
  executionEnvironment,
  writeResult,
  forceGc,
  log,
  memory,
  assemble,
  watchErrors,
  type Command,
} from './common';

const watch = watchErrors();
afterAll(() => {
  const c = watch.count;
  watch.stop();
  expect(c.unhandledRejection + c.uncaughtException).toBe(0);
});

const result: Record<string, unknown> = {};
const save = (): void =>
  writeResult('e6-memoria.json', {
    testRun: 'E6 memoria y fugas',
    environment: executionEnvironment(),
    configuration: {
      newWaybills: CONFIG.newMemoryWaybills,
      operations: CONFIG.memoryOps,
      scheduledWaybills: CONFIG.memoryWaybills,
      measureStep: CONFIG.memoryStep,
      growthMargin: GROWTH_MARGIN,
      minimumMarginBytes: GROWTH_MARGIN_MIN_BYTES,
    },
    ...result,
  });

describe('E6 memoria y fugas', () => {
  it(`(a) ${CONFIG.newMemoryWaybills} guías nuevas: bytes por guía`, async () => {
    const n = CONFIG.newMemoryWaybills;
    const data = createData();
    const m = assemble(data, { readMs: 0, writeMs: 0 });

    forceGc();
    const before = memory();
    for (let i = 0; i < n; i++) {
      await m.useCase.execute(commandFor(i));
    }
    forceGc();
    const after = memory();

    const growth = after.heapUsed - before.heapUsed;
    const bytesPerWaybill = growth / n;
    const writes = data.waybillsStore.writes;

    log('E6', `(a) guías nuevas=${n} escrituras reales=${writes}`);
    log(
      'E6',
      `(a) heap tras gc antes=${toMB(before.heapUsed)} MB, después=${toMB(after.heapUsed)} MB, crecimiento=${toMB(growth)} MB ≈ ${bytesPerWaybill.toFixed(0)} bytes por guía (${n} guías)`,
    );

    result.a = {
      newWaybills: n,
      actual_writes: writes,
      heapBeforeGc: before.heapUsed,
      heapAfterGc: after.heapUsed,
      bytesGrowth: growth,
      bytesPerWaybillApprox: Math.round(bytesPerWaybill),
      note: 'Incluye el Map del repositorio, la copia de la guía y sus objetos de valor (TenantId, WaybillNumber, CivilDate).',
    };
    save();

    expect(writes).toBe(n);
    expect(m.waybills.failures + m.coverages.failures).toBe(0);
  }, 900_000);

  it(`(b) ${CONFIG.memoryOps} llamadas idempotentes sobre ${CONFIG.memoryWaybills} guías agendadas`, async () => {
    const goal = CONFIG.memoryWaybills;
    const data = createData();
    const m = assemble(data, { readMs: 0, writeMs: 0 });

    // Seeding: only the waybills that end up AGENDADA are taken (the idempotent ones are the scheduled ones).
    const cmds: Command[] = [];
    const dates: string[] = [];
    const attemptLimit = goal * 50;
    for (let i = 0; cmds.length < goal; i++) {
      if (i >= attemptLimit) {
        throw new Error(`Solo ${cmds.length} de ${goal} guías quedaron AGENDADA tras ${i} intentos; revisa la cobertura de datos`);
      }
      const c = commandFor(i);
      const r = await m.useCase.execute(c);
      if (r.status === 'AGENDADA') {
        cmds.push(c);
        dates.push(r.appointmentDate!);
      }
    }
    const seededWrites = data.waybillsStore.writes;
    const auditInitial = await runAudit(data.waybillsStore, cmds, data.specifications);

    const points: { ops: number; heapUsed: number; rss: number }[] = [];
    forceGc();
    points.push({ ops: 0, ...memory() });
    log('E6', `(b) sembradas=${cmds.length} agendadas; heap inicial=${toMB(points[0]!.heapUsed)} MB`);

    let inconsistent = 0;
    const start = performance.now();
    for (let k = 0; k < CONFIG.memoryOps; k++) {
      const idx = k % cmds.length;
      const r = await m.useCase.execute(cmds[idx]!);
      if (r.status !== 'AGENDADA' || r.appointmentDate !== dates[idx]) inconsistent++;
      if ((k + 1) % CONFIG.memoryStep === 0) {
        forceGc();
        const point = { ops: k + 1, ...memory() };
        points.push(point);
        log('E6', `(b) ops=${point.ops} heapUsed tras gc=${toMB(point.heapUsed)} MB rss=${toMB(point.rss)} MB`);
      }
    }
    const seconds = (performance.now() - start) / 1000;

    const writesAfterCalls = data.waybillsStore.writes;
    const auditFinal = await runAudit(data.waybillsStore, cmds, data.specifications);

    const base = points.find((p) => p.ops === CONFIG.memoryStep);
    const end = points[points.length - 1]!;
    const growth = base && end.ops > base.ops ? end.heapUsed - base.heapUsed : NaN;
    const limit = base ? Math.max(GROWTH_MARGIN * base.heapUsed, GROWTH_MARGIN_MIN_BYTES) : NaN;
    const passed = Number.isFinite(growth) && growth <= limit;

    log(
      'E6',
      `(b) operaciones=${CONFIG.memoryOps} tiempo=${seconds.toFixed(2)} s; escrituras durante llamadas=${writesAfterCalls - seededWrites}; incoherentes=${inconsistent}`,
    );
    log(
      'E6',
      `(b) crecimiento de heap tras gc entre ${CONFIG.memoryStep} y ${end.ops} ops = ${toMB(growth)} MB; límite = ${toMB(limit)} MB; ${passed ? 'CUMPLE' : 'NO CUMPLE'}`,
    );

    result.b = {
      operations: CONFIG.memoryOps,
      scheduledWaybills: cmds.length,
      seconds: Number(seconds.toFixed(3)),
      writes_during_calls: writesAfterCalls - seededWrites,
      inconsistent,
      initialAuditReport: auditInitial,
      finalAuditReport: auditFinal,
      points: points.map((p) => ({ ops: p.ops, heapUsedBytes: p.heapUsed, rssBytes: p.rss })),
      criterion: {
        from: base?.ops ?? null,
        until: end.ops,
        bytesGrowth: Number.isFinite(growth) ? growth : null,
        limitBytes: Number.isFinite(limit) ? limit : null,
        passed,
      },
    };
    save();

    expect(inconsistent).toBe(0);
    expect(writesAfterCalls).toBe(seededWrites);
    expect(auditFinal.corrupt + auditFinal.versionDistinctFromOne + auditFinal.distinctAppointment).toBe(0);
    expect(base, 'hace falta un punto de medición en STRESS_MEMORY_STEP').toBeDefined();
    expect(end.ops).toBeGreaterThan(base!.ops);
    expect(passed, `crecimiento ${toMB(growth)} MB > límite ${toMB(limit)} MB`).toBe(true);
  }, 900_000);
});

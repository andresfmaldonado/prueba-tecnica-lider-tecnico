/**
 * E4 Concurrency rungs: for each N in STRESS_STEPS (trimmed by STRESS_MAX_CONCURRENT), N distinct
 * waybills in flight at once, L = 20 ms per operation.
 * Stops if RSS exceeds STRESS_RSS_LIMIT_MB.
 * Breakpoint = first rung with errors > 0, or latency p99 > 5 × that of the first rung,
 * or event-loop delay p99 > 1000 ms.
 */
import { afterAll, describe, expect, it } from 'vitest';
import {
  CONFIG,
  RUNGS,
  LATENCY_E4_MS,
  BREAKPOINT_P99_THRESHOLD,
  DELAY_P99_THRESHOLD_MS,
} from './configuration';
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
  measureDelay,
  assemble,
  sampleRss,
  summaryMs,
  watchErrors,
  type SummaryMs,
} from './common';

interface Step {
  rung: number;
  seconds: number;
  waybillsPerSecond: number;
  completed: number;
  errors: number;
  kinds: Record<string, number>;
  writes: number;
  present: number;
  inconsistent: number;
  latencyMs: SummaryMs;
  delayMs: { p99: number; max: number; samples: number };
  maxRssMB: number;
}

interface Breakpoint {
  rung: number;
  criterion: string;
}

function breakpointPoint(steps: Step[]): Breakpoint | null {
  if (steps.length === 0) return null;
  const base = steps[0]!.latencyMs.p99;
  for (const s of steps) {
    if (s.errors > 0) return { rung: s.rung, criterion: `errores > 0 (${s.errors})` };
    if (s.latencyMs.p99 > BREAKPOINT_P99_THRESHOLD * base) {
      return {
        rung: s.rung,
        criterion: `p99 de latencia ${s.latencyMs.p99} ms > ${BREAKPOINT_P99_THRESHOLD} × ${base} ms del primer escalón`,
      };
    }
    if (s.delayMs.p99 > DELAY_P99_THRESHOLD_MS) {
      return { rung: s.rung, criterion: `retardo p99 del bucle ${s.delayMs.p99} ms > ${DELAY_P99_THRESHOLD_MS} ms` };
    }
  }
  return null;
}

const watch = watchErrors();
afterAll(() => {
  const c = watch.count;
  watch.stop();
  expect(c.unhandledRejection + c.uncaughtException).toBe(0);
});

describe('E4 escalones de concurrencia', () => {
  it(`escalones [${RUNGS.join(', ')}] · L=${LATENCY_E4_MS} ms · tope RSS ${CONFIG.rssLimitMb} MB`, async () => {
    const steps: Step[] = [];
    let stoppedByRss: string | null = null;

    for (const n of RUNGS) {
      const data = createData();
      const m = assemble(data, { readMs: LATENCY_E4_MS, writeMs: LATENCY_E4_MS });
      const commands = Array.from({ length: n }, (_, i) => commandFor(i));

      forceGc();
      const delay = measureDelay();
      const rss = sampleRss();
      const r = await runPool(m.useCase, commands, n);
      const delayStats = delay.stop();
      const maxRss = rss.stop();

      const audit = await runAudit(data.waybillsStore, commands, data.specifications, r.status);
      const latency = summaryMs(r.latenciesMs);
      const step: Step = {
        rung: n,
        seconds: Number(r.seconds.toFixed(3)),
        waybillsPerSecond: Number((r.completed / r.seconds).toFixed(1)),
        completed: r.completed,
        errors: r.errors,
        kinds: r.kinds,
        writes: data.waybillsStore.writes,
        present: audit.present,
        inconsistent: audit.corrupt + audit.versionDistinctFromOne + audit.distinctAppointment,
        latencyMs: latency,
        delayMs: delayStats,
        maxRssMB: toMB(maxRss),
      };
      steps.push(step);

      log(
        'E4',
        `N=${n} tiempo=${step.seconds} s throughput=${step.waybillsPerSecond} guías/s errores=${step.errors} escrituras=${step.writes}`,
      );
      log(
        'E4',
        `N=${n} latencia ms p50=${latency.p50} p95=${latency.p95} p99=${latency.p99} máx=${latency.max} | retardo bucle p99=${delayStats.p99} ms máx=${delayStats.max} ms | RSS máx=${step.maxRssMB} MB`,
      );

      if (step.maxRssMB > CONFIG.rssLimitMb) {
        stoppedByRss = `RSS máximo ${step.maxRssMB} MB > ${CONFIG.rssLimitMb} MB tras N=${n}; no se ejecutan los escalones siguientes`;
        log('E4', stoppedByRss);
        break;
      }
    }

    const breakpoint = breakpointPoint(steps);
    const last = steps[steps.length - 1]!.rung;
    const conclusionBreakpoint = breakpoint
      ? `escalón ${breakpoint.rung}: ${breakpoint.criterion}`
      : `no se alcanzó hasta N=${last}`;
    log('E4', `punto de quiebre: ${conclusionBreakpoint}`);

    writeResult('e4-escalones.json', {
      testRun: 'E4 escalones de concurrencia',
      environment: executionEnvironment(),
      configuration: {
        rungs: RUNGS,
        latencyPerOperationMs: LATENCY_E4_MS,
        concurrency: 'N guías distintas, todas en vuelo a la vez',
        rssLimitMb: CONFIG.rssLimitMb,
        breakpointP99Threshold: BREAKPOINT_P99_THRESHOLD,
        delayP99ThresholdMs: DELAY_P99_THRESHOLD_MS,
      },
      note_rss: 'El RSS es el del proceso worker de vitest y es un máximo acumulado: no baja entre escalones.',
      steps,
      stopped_by_rss: stoppedByRss,
      breakpoint_point: breakpoint,
      conclusion_breakpoint: conclusionBreakpoint,
    });

    expect(steps.length).toBeGreaterThan(0);
    for (const p of steps) {
      expect(p.errors, `escalón ${p.rung}`).toBe(0);
      expect(p.writes, `escalón ${p.rung}`).toBe(p.rung);
      expect(p.inconsistent, `escalón ${p.rung}`).toBe(0);
    }
  }, 900_000);
});

/**
 * C4: open load. Arrivals follow a fixed pace and do not wait for earlier ones.
 * Paces 5, 50 and 500 req/s; each segment lasts LOAD_OPEN_SECONDS; L = 20 ms per call.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONFIG,
  OPEN_LATENCY_MS,
  OPEN_PACES,
  BATCH_PEAK_PACE,
  P99_PEAK_PACE_THRESHOLD_MS,
} from './configuration';
import { commandFor, createWorld, summary, sleep } from './common';

const RESULTS = fileURLToPath(new URL('./resultados/', import.meta.url));

async function segment(pace: number) {
  const world = createWorld({ readMs: OPEN_LATENCY_MS, writeMs: OPEN_LATENCY_MS });
  const total = Math.round(pace * CONFIG.openSegmentSeconds);
  const intervalMs = 1000 / pace;
  const latenciesMs: number[] = [];
  const errorMessages: string[] = [];
  const inFlightByArrival: number[] = [];
  const promises: Promise<void>[] = [];
  let completed = 0;
  let errors = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  let maxDelayMs = 0;

  const start = performance.now();
  for (let k = 0; k < total; k++) {
    const due = start + k * intervalMs;
    const wait = due - performance.now();
    if (wait > 0.5) await sleep(wait);
    maxDelayMs = Math.max(maxDelayMs, performance.now() - due);

    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    inFlightByArrival.push(inFlight - 1);
    const t0 = performance.now();
    promises.push(
      world.useCase.execute(commandFor(k)).then(
        () => {
          latenciesMs.push(performance.now() - t0);
          completed++;
        },
        (error) => {
          errors++;
          if (errorMessages.length < 5) errorMessages.push(String(error));
        },
      ).finally(() => {
        inFlight--;
      }),
    );
  }
  const launchEnd = performance.now();
  const pendingAtClose = inFlight;
  await Promise.all(promises);
  const end = performance.now();

  // Backlog: if it grows, the mean of in-flight calls in the last third exceeds that of the first.
  const tercile = Math.max(1, Math.floor(inFlightByArrival.length / 3));
  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const meanFirstTercile = mean(inFlightByArrival.slice(0, tercile));
  const meanLastTercile = mean(inFlightByArrival.slice(-tercile));

  return {
    target_pace_req_s: pace,
    window_s: CONFIG.openSegmentSeconds,
    launched: total,
    achieved_launch_pace_req_s: Math.round((total / ((launchEnd - start) / 1000)) * 100) / 100,
    completed,
    errors,
    error_messages: errorMessages,
    achieved_throughput_req_s: Math.round((completed / ((end - start) / 1000)) * 100) / 100,
    end_to_end_latency_ms: summary(latenciesMs),
    max_in_flight: maxInFlight,
    pending_at_launch_close: pendingAtClose,
    drain_after_close_ms: Math.round((end - launchEnd) * 1000) / 1000,
    max_launch_delay_ms: Math.round(maxDelayMs * 1000) / 1000,
    mean_in_flight_first_tercile: Math.round(meanFirstTercile * 100) / 100,
    mean_in_flight_last_tercile: Math.round(meanLastTercile * 100) / 100,
    growing_backlog: meanLastTercile > 2 * meanFirstTercile + 1,
    repository_calls: world.callTimes.length,
    actual_writes: world.waybillsStore.writes,
  };
}

describe('C4 carga abierta', () => {
  it('5, 50 y 500 req/s: p50/p95/p99, en vuelo y backlog; criterio p99 < 200 ms a 5 req/s', async () => {
    mkdirSync(RESULTS, { recursive: true });
    const segments = [];
    for (const pace of OPEN_PACES) {
      const r = await segment(pace);
      segments.push(r);
      console.log(
        `[C4] ${pace} req/s: lanzadas=${r.launched} completadas=${r.completed} errores=${r.errors} ` +
          `throughput=${r.achieved_throughput_req_s} p50=${r.end_to_end_latency_ms.p50} ` +
          `p95=${r.end_to_end_latency_ms.p95} p99=${r.end_to_end_latency_ms.p99} ` +
          `max=${r.end_to_end_latency_ms.max} maxInFlight=${r.max_in_flight} ` +
          `backlogCreciente=${r.growing_backlog} retrasoMax=${r.max_launch_delay_ms}ms`,
      );
    }

    const peak = segments.find((t) => t.target_pace_req_s === BATCH_PEAK_PACE)!;
    const criterion = {
      p99_at_peak_ms: peak.end_to_end_latency_ms.p99,
      p99_threshold_ms: P99_PEAK_PACE_THRESHOLD_MS,
      meets_p99: peak.end_to_end_latency_ms.p99 < P99_PEAK_PACE_THRESHOLD_MS,
      growing_backlog_at_peak: peak.growing_backlog,
      meets_no_backlog: !peak.growing_backlog,
    };
    writeFileSync(
      `${RESULTS}c4-carga-abierta.json`,
      JSON.stringify({ testRun: 'C4 carga abierta', latency_ms: OPEN_LATENCY_MS, segments, criterion }, null, 2),
    );

    for (const t of segments) expect(t.errors, `errores a ${t.target_pace_req_s} req/s`).toBe(0);
    expect(criterion.meets_p99, `p99 a ${BATCH_PEAK_PACE} req/s`).toBe(true);
    expect(criterion.meets_no_backlog, `backlog a ${BATCH_PEAK_PACE} req/s`).toBe(true);
  }, 900_000);
});

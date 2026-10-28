const DAY_MS = 86_400_000;

const toMs = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y!, m! - 1, d!);
};
const toISO = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/**
 * Reference implementation of the rule, written apart from the domain and using the
 * native UTC calendar: first business day (Monday to Friday) with coverage between
 * tomorrow and today + 15, both inclusive; null if none qualifies.
 */
export function expectedAppointment(todayISO: string, days: Iterable<number>, unavailable: Iterable<string>): string | null {
  const withCoverage = new Set(days);
  const closed = new Set(unavailable);
  for (let k = 1; k <= 15; k++) {
    const ms = toMs(todayISO) + k * DAY_MS;
    const dow = new Date(ms).getUTCDay(); // 0 = Sunday
    const isoDow = dow === 0 ? 7 : dow;
    const business = dow >= 1 && dow <= 5;
    if (business && withCoverage.has(isoDow) && !closed.has(toISO(ms))) return toISO(ms);
  }
  return null;
}

import type { Coverage } from './coverage';
import type { CivilDate, Weekday } from './civil-date';

export interface SchedulingRules {
  /** Calendar days, counted from tomorrow, in which coverage is searched for. */
  windowDays: number;
  /** ISO weekdays (1 = Monday ... 7 = Sunday) on which an appointment can be given. */
  businessDays: ReadonlySet<Weekday>;
}

/** Calendar days, counted from tomorrow, in which coverage is searched for (default). */
export const WINDOW_DAYS = 15;

/** Monday to Friday. Public holidays are modeled as unavailable dates in the coverage. */
export const DEFAULT_RULES: SchedulingRules = {
  windowDays: WINDOW_DAYS,
  businessDays: new Set<Weekday>([1, 2, 3, 4, 5]),
};

/**
 * First business day with coverage between tomorrow (today + 1) and today + windowDays, both inclusive.
 * Returns null if no coverage is configured or no date in the window qualifies.
 */
export function firstCoverageDay(
  today: CivilDate,
  coverage: Coverage | null,
  rules: SchedulingRules = DEFAULT_RULES,
): CivilDate | null {
  if (coverage === null) return null;
  for (let d = 1; d <= rules.windowDays; d++) {
    const candidate = today.plusDays(d);
    if (rules.businessDays.has(candidate.weekday()) && coverage.covers(candidate)) return candidate;
  }
  return null;
}

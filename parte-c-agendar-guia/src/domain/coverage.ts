import type { Weekday, CivilDate } from './civil-date';

/**
 * Days on which the client has coverage in a city: a weekly pattern plus
 * per-date exceptions (public holidays, operational closures).
 */
export class Coverage {
  private readonly days: ReadonlySet<Weekday>;
  private readonly unavailable: ReadonlySet<string>;

  constructor(weekdays: Iterable<Weekday>, unavailableDates: Iterable<CivilDate> = []) {
    this.days = new Set(weekdays);
    this.unavailable = new Set([...unavailableDates].map((f) => f.toString()));
  }

  covers(date: CivilDate): boolean {
    return this.days.has(date.weekday()) && !this.unavailable.has(date.toString());
  }
}

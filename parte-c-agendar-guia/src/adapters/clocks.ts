import type { Clock } from '../application/ports';
import { CivilDate } from '../domain/civil-date';
import { DEFAULT_TIME_ZONE } from './settings-from-env';

export class FixedClock implements Clock {
  constructor(private current: CivilDate) {}

  today(): CivilDate {
    return this.current;
  }

  setToday(date: CivilDate): void {
    this.current = date;
  }
}

/** Production clock: the local date of the operation (Colombia by default), not the server date. */
export class SystemClock implements Clock {
  constructor(
    private readonly timeZoneId = DEFAULT_TIME_ZONE,
    private readonly now: () => Date = () => new Date(),
  ) {}

  today(): CivilDate {
    // The en-CA locale formats dates as AAAA-MM-DD.
    const iso = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.timeZoneId,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.now());
    return CivilDate.fromISO(iso);
  }
}

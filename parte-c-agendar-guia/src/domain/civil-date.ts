import { abbreviate, InvalidInput } from './errors';

const MS_PER_DAY = 86_400_000;
// Supported range: outside it, the AAAA-MM-DD format is no longer valid (e.g. "+010000-01-01").
const MIN_DAY = Date.UTC(1900, 0, 1) / MS_PER_DAY;
const MAX_DAY = Date.UTC(9999, 11, 31) / MS_PER_DAY;

/** ISO weekday: 1 = Monday ... 7 = Sunday. */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Calendar date without time or time zone. Arithmetic is done on whole days,
 * so daylight-saving changes or the server time zone do not affect the rule.
 */
export class CivilDate {
  private constructor(private readonly daysSinceEpoch: number) {
    if (!Number.isInteger(daysSinceEpoch) || daysSinceEpoch < MIN_DAY || daysSinceEpoch > MAX_DAY) {
      throw new InvalidInput('Fecha fuera del rango soportado (1900-01-01 a 9999-12-31)');
    }
  }

  static of(yearNumber: number, monthNumber: number, dayNumber: number): CivilDate {
    const ms = Date.UTC(yearNumber, monthNumber - 1, dayNumber);
    const f = new Date(ms);
    if (f.getUTCFullYear() !== yearNumber || f.getUTCMonth() !== monthNumber - 1 || f.getUTCDate() !== dayNumber) {
      throw new InvalidInput(`Fecha inexistente: ${yearNumber}-${monthNumber}-${dayNumber}`);
    }
    return new CivilDate(ms / MS_PER_DAY);
  }

  static fromISO(iso: string): CivilDate {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) throw new InvalidInput(`Formato de fecha inválido (se espera AAAA-MM-DD): ${abbreviate(iso)}`);
    return CivilDate.of(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  plusDays(n: number): CivilDate {
    return new CivilDate(this.daysSinceEpoch + n);
  }

  weekday(): Weekday {
    const dow = new Date(this.daysSinceEpoch * MS_PER_DAY).getUTCDay();
    return (dow === 0 ? 7 : dow) as Weekday;
  }

  equals(another: CivilDate): boolean {
    return this.daysSinceEpoch === another.daysSinceEpoch;
  }

  toString(): string {
    return new Date(this.daysSinceEpoch * MS_PER_DAY).toISOString().slice(0, 10);
  }
}

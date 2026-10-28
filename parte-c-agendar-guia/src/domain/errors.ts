/** Truncates a text so it can be quoted in an error message without repeating huge inputs. */
export function abbreviate(text: unknown, maximum = 60): string {
  const t = String(text);
  return t.length <= maximum ? t : `${t.slice(0, maximum)}… (${t.length} caracteres)`;
}

export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class InvalidInput extends DomainError {}

export class WaybillAlreadyScheduled extends DomainError {}

/** The waybill changed between being read and being saved (optimistic concurrency control). */
export class VersionConflict extends DomainError {}

/** A configuration value (e.g. an environment variable) is missing its valid range or format. */
export class InvalidConfiguration extends DomainError {}

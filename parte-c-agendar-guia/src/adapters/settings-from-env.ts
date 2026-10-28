import { abbreviate, InvalidConfiguration } from '../domain/errors';
import type { Weekday } from '../domain/civil-date';
import { DEFAULT_SETTINGS } from '../application/scheduling-settings';
import type { SchedulingSettings } from '../application/scheduling-settings';

export const DEFAULT_TIME_ZONE = 'America/Bogota';

export interface EnvironmentSettings extends SchedulingSettings {
  timeZone: string;
}

type Environment = Record<string, string | undefined>;

// The library has no Node typings (tsconfig types: []); only this adapter touches the environment.
declare const process: { env: Environment };

/** Reads an integer variable; unset or empty keeps the default. */
function integer(env: Environment, name: string, fallback: number, minimum: number, maximum: number): number {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || value < minimum || value > maximum) {
    throw new InvalidConfiguration(`${name} debe ser un entero entre ${minimum} y ${maximum}: ${abbreviate(raw)}`);
  }
  return value;
}

function weekdays(env: Environment, name: string, fallback: ReadonlySet<Weekday>): ReadonlySet<Weekday> {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  const days = raw.split(',').map((part) => part.trim());
  if (!days.every((d) => /^[1-7]$/.test(d))) {
    throw new InvalidConfiguration(`${name} debe ser una lista de días ISO 1-7 separados por coma: ${abbreviate(raw)}`);
  }
  return new Set(days.map((d) => Number(d) as Weekday));
}

function timeZone(env: Environment, name: string, fallback: string): string {
  const raw = env[name]?.trim();
  if (!raw) return fallback;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: raw });
  } catch {
    throw new InvalidConfiguration(`${name} no es una zona horaria IANA válida: ${abbreviate(raw)}`);
  }
  return raw;
}

/**
 * The only place that reads configuration from the environment.
 * Unset or empty variables keep the current behaviour (see DEFAULT_SETTINGS).
 */
export function settingsFromEnvironment(env: Environment = process.env): EnvironmentSettings {
  return {
    windowDays: integer(env, 'SCHEDULING_WINDOW_DAYS', DEFAULT_SETTINGS.windowDays, 1, 60),
    conflictAttempts: integer(env, 'SCHEDULING_CONFLICT_ATTEMPTS', DEFAULT_SETTINGS.conflictAttempts, 1, 10),
    businessDays: weekdays(env, 'SCHEDULING_BUSINESS_DAYS', DEFAULT_SETTINGS.businessDays),
    timeZone: timeZone(env, 'SCHEDULING_TIME_ZONE', DEFAULT_TIME_ZONE),
  };
}

import { DEFAULT_RULES } from '../domain/scheduling-policy';
import type { SchedulingRules } from '../domain/scheduling-policy';

/** How many attempts are made if another request modifies the same waybill at the same time. */
export const ATTEMPTS_ON_CONFLICT = 2;

export interface SchedulingSettings extends SchedulingRules {
  conflictAttempts: number;
}

export const DEFAULT_SETTINGS: SchedulingSettings = {
  ...DEFAULT_RULES,
  conflictAttempts: ATTEMPTS_ON_CONFLICT,
};

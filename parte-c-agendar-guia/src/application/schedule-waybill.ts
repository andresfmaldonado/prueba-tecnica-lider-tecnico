import { VersionConflict } from '../domain/errors';
import { Waybill } from '../domain/waybill';
import type { WaybillStatus } from '../domain/waybill';
import { City, WaybillNumber, TenantId } from '../domain/identifiers';
import { firstCoverageDay } from '../domain/scheduling-policy';
import type { CoverageRepository, WaybillRepository, Clock } from './ports';
import { DEFAULT_SETTINGS } from './scheduling-settings';
import type { SchedulingSettings } from './scheduling-settings';

export { ATTEMPTS_ON_CONFLICT } from './scheduling-settings';

export interface ScheduleWaybillCommand {
  tenant: string;
  waybillNumber: string;
  city: string;
}

export interface ScheduleWaybillResult {
  status: WaybillStatus;
  /** AAAA-MM-DD; null if the waybill ended up SIN_COBERTURA. */
  appointmentDate: string | null;
}

export class ScheduleWaybill {
  constructor(
    private readonly waybills: WaybillRepository,
    private readonly coverages: CoverageRepository,
    private readonly clock: Clock,
    private readonly settings: SchedulingSettings = DEFAULT_SETTINGS,
  ) {}

  async execute(command: ScheduleWaybillCommand): Promise<ScheduleWaybillResult> {
    const tenantId = TenantId.of(command.tenant);
    const waybillNo = WaybillNumber.of(command.waybillNumber);
    const city = City.of(command.city);

    for (let attempt = 1; ; attempt++) {
      try {
        return await this.tryTo(tenantId, waybillNo, city);
      } catch (error) {
        // Because the use case is idempotent, rereading and retrying is safe.
        if (!(error instanceof VersionConflict) || attempt >= this.settings.conflictAttempts) throw error;
      }
    }
  }

  private async tryTo(tenantId: TenantId, waybillNo: WaybillNumber, city: City): Promise<ScheduleWaybillResult> {
    // The waybill may not exist in this service yet: the command carries what is needed to create it.
    const waybill = (await this.waybills.find(tenantId, waybillNo)) ?? Waybill.pending(tenantId, waybillNo);

    // Idempotent: repeating the request neither moves the appointment nor writes again.
    if (waybill.isScheduled()) return toResult(waybill);

    const coverage = await this.coverages.find(tenantId, city);
    const date = firstCoverageDay(this.clock.today(), coverage, this.settings);

    if (date !== null) waybill.schedule(date);
    else waybill.markNoCoverage();

    if (waybill.hasChanges()) await this.waybills.save(waybill);
    return toResult(waybill);
  }
}

function toResult(waybill: Waybill): ScheduleWaybillResult {
  return { status: waybill.status, appointmentDate: waybill.appointmentDate?.toString() ?? null };
}

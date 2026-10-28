import type { Coverage } from '../domain/coverage';
import type { CivilDate } from '../domain/civil-date';
import type { Waybill } from '../domain/waybill';
import type { City, WaybillNumber, TenantId } from '../domain/identifiers';

export interface CoverageRepository {
  /** null when the client has no coverage configured in the city. */
  find(tenantId: TenantId, city: City): Promise<Coverage | null>;
}

export interface WaybillRepository {
  find(tenantId: TenantId, waybillNo: WaybillNumber): Promise<Waybill | null>;
  /**
   * Optimistic concurrency control: fails with VersionConflict if the stored waybill is not at
   * `waybill.originalVersion` (0 if it does not exist yet). The caller rereads and retries.
   */
  save(waybill: Waybill): Promise<void>;
}

export interface Clock {
  /** "Today" in the time zone of the operation, not the server time zone. */
  today(): CivilDate;
}

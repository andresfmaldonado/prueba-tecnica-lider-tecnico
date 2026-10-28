import { abbreviate, InvalidInput, WaybillAlreadyScheduled } from './errors';
import type { CivilDate } from './civil-date';
import type { WaybillNumber, TenantId } from './identifiers';

export type WaybillStatus = 'PENDIENTE_AGENDA' | 'AGENDADA' | 'SIN_COBERTURA';

export class Waybill {
  private constructor(
    readonly tenantId: TenantId,
    readonly waybillNo: WaybillNumber,
    private currentStatus: WaybillStatus,
    private currentAppointmentDate: CivilDate | null,
    private currentVersion: number,
    /** Version read from persistence (0 if the waybill is new): basis for optimistic concurrency control. */
    readonly originalVersion: number,
  ) {}

  static pending(tenantId: TenantId, waybillNo: WaybillNumber): Waybill {
    return new Waybill(tenantId, waybillNo, 'PENDIENTE_AGENDA', null, 0, 0);
  }

  /** Rehydrates from persistence, enforcing the invariant that only AGENDADA has an appointment date. */
  static rehydrate(
    tenantId: TenantId,
    waybillNo: WaybillNumber,
    status: WaybillStatus,
    appointmentDate: CivilDate | null,
    version: number,
  ): Waybill {
    if ((status === 'AGENDADA') !== (appointmentDate !== null)) {
      throw new InvalidInput(`Estado ${status} incoherente con la fecha de cita`);
    }
    if (!Number.isInteger(version) || version < 0) {
      throw new InvalidInput(`Versión inválida: ${version}`);
    }
    return new Waybill(tenantId, waybillNo, status, appointmentDate, version, version);
  }

  get status(): WaybillStatus {
    return this.currentStatus;
  }

  get appointmentDate(): CivilDate | null {
    return this.currentAppointmentDate;
  }

  /** Increases with every status change; the event sent to the legacy system carries it to discard out-of-order events. */
  get version(): number {
    return this.currentVersion;
  }

  /** There is something to persist: the aggregate changed since it was read. */
  hasChanges(): boolean {
    return this.currentVersion !== this.originalVersion;
  }

  isScheduled(): boolean {
    return this.currentStatus === 'AGENDADA';
  }

  schedule(date: CivilDate): void {
    this.requireNotScheduled();
    this.currentStatus = 'AGENDADA';
    this.currentAppointmentDate = date;
    this.currentVersion++;
  }

  markNoCoverage(): void {
    this.requireNotScheduled();
    // Retrying without new coverage changes nothing: the version is not increased and nothing needs writing.
    if (this.currentStatus === 'SIN_COBERTURA') return;
    this.currentStatus = 'SIN_COBERTURA';
    this.currentAppointmentDate = null;
    this.currentVersion++;
  }

  private requireNotScheduled(): void {
    if (this.isScheduled()) {
      throw new WaybillAlreadyScheduled(`La guía ${abbreviate(this.waybillNo.value)} ya está agendada para ${this.currentAppointmentDate}`);
    }
  }
}

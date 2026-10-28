import type { WaybillRepository } from '../application/ports';
import { abbreviate, VersionConflict } from '../domain/errors';
import { Waybill } from '../domain/waybill';
import type { WaybillNumber, TenantId } from '../domain/identifiers';
import { compositeKey } from './key';

const key = (tenantId: TenantId, waybillNo: WaybillNumber) => compositeKey(tenantId.value, waybillNo.value);

/** Stores copies so that mutating a Waybill outside the repository does not alter what is "persisted". */
export class InMemoryWaybillRepository implements WaybillRepository {
  private readonly store = new Map<string, Waybill>();
  /** Number of writes performed; lets tests verify that no unnecessary writes happen. */
  writes = 0;

  async find(tenantId: TenantId, waybillNo: WaybillNumber): Promise<Waybill | null> {
    const saved = this.store.get(key(tenantId, waybillNo));
    return saved ? duplicate(saved) : null;
  }

  async save(waybill: Waybill): Promise<void> {
    const k = key(waybill.tenantId, waybill.waybillNo);
    const savedVersion = this.store.get(k)?.version ?? 0;
    if (savedVersion !== waybill.originalVersion) {
      throw new VersionConflict(
        `La guía ${abbreviate(waybill.waybillNo.value)} cambió mientras se procesaba: se esperaba la versión ${waybill.originalVersion} y hay la ${savedVersion}`,
      );
    }
    this.writes++;
    this.store.set(k, duplicate(waybill));
  }

  /** Seeds a waybill without counting it as a write (scenario setup). */
  seed(waybill: Waybill): void {
    this.store.set(key(waybill.tenantId, waybill.waybillNo), duplicate(waybill));
  }
}

function duplicate(g: Waybill): Waybill {
  return Waybill.rehydrate(g.tenantId, g.waybillNo, g.status, g.appointmentDate, g.version);
}

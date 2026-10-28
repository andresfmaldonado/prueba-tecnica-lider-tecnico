import type { CoverageRepository } from '../application/ports';
import type { Coverage } from '../domain/coverage';
import type { City, TenantId } from '../domain/identifiers';
import { compositeKey } from './key';

export class InMemoryCoverageRepository implements CoverageRepository {
  private readonly store = new Map<string, Coverage>();

  define(tenantId: TenantId, city: City, coverage: Coverage): void {
    this.store.set(compositeKey(tenantId.value, city.value), coverage);
  }

  async find(tenantId: TenantId, city: City): Promise<Coverage | null> {
    return this.store.get(compositeKey(tenantId.value, city.value)) ?? null;
  }
}

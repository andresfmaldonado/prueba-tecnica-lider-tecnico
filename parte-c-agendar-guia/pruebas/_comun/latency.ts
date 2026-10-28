import { InMemoryCoverageRepository, InMemoryWaybillRepository } from '../../src';
import type {
  City,
  Coverage,
  CoverageRepository,
  Waybill,
  WaybillRepository,
  WaybillNumber,
  TenantId,
} from '../../src';
import { generator } from './data';

export interface LatencyOptions {
  readMs?: number;
  writeMs?: number;
  /** Probability (0–1) that an operation throws a transient error. */
  failureRate?: number;
  seedValue?: number;
}

export class InjectedError extends Error {
  constructor() {
    super('fallo inyectado');
    this.name = 'InjectedError';
  }
}

const waitFor = (ms: number): Promise<void> =>
  ms > 0 ? new Promise<void>((solve) => setTimeout(solve, ms)) : Promise.resolve();

class Simulator {
  /** Attempts, not successes: includes those that ended in an injected failure or in a conflict. */
  reads = 0;
  writes = 0;
  failures = 0;
  private readonly random: () => number;

  constructor(protected readonly options: LatencyOptions) {
    this.random = generator(options.seedValue ?? 1);
  }

  protected async simulate(ms: number): Promise<void> {
    await waitFor(ms);
    const rate = this.options.failureRate ?? 0;
    if (rate > 0 && this.random() < rate) {
      this.failures++;
      throw new InjectedError();
    }
  }
}

/** In-memory waybill repository with simulated latency and injectable failures. */
export class WaybillsWithLatency extends Simulator implements WaybillRepository {
  constructor(
    readonly internal: InMemoryWaybillRepository = new InMemoryWaybillRepository(),
    options: LatencyOptions = {},
  ) {
    super(options);
  }

  async find(tenantId: TenantId, waybillNo: WaybillNumber): Promise<Waybill | null> {
    this.reads++;
    await this.simulate(this.options.readMs ?? 0);
    return this.internal.find(tenantId, waybillNo);
  }

  async save(waybill: Waybill): Promise<void> {
    this.writes++;
    await this.simulate(this.options.writeMs ?? 0);
    return this.internal.save(waybill);
  }
}

/** In-memory coverage repository with simulated latency and injectable failures. */
export class CoveragesWithLatency extends Simulator implements CoverageRepository {
  constructor(
    readonly internal: InMemoryCoverageRepository = new InMemoryCoverageRepository(),
    options: LatencyOptions = {},
  ) {
    super(options);
  }

  async find(tenantId: TenantId, city: City): Promise<Coverage | null> {
    this.reads++;
    await this.simulate(this.options.readMs ?? 0);
    return this.internal.find(tenantId, city);
  }
}

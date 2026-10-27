import type { CoberturaRepository } from '../application/puertos';
import type { Cobertura } from '../domain/cobertura';
import type { Ciudad, TenantId } from '../domain/identificadores';

export class CoberturaRepositoryEnMemoria implements CoberturaRepository {
  private readonly almacen = new Map<string, Cobertura>();

  definir(tenantId: TenantId, ciudad: Ciudad, cobertura: Cobertura): void {
    this.almacen.set(`${tenantId.valor}::${ciudad.valor}`, cobertura);
  }

  async obtener(tenantId: TenantId, ciudad: Ciudad): Promise<Cobertura | null> {
    return this.almacen.get(`${tenantId.valor}::${ciudad.valor}`) ?? null;
  }
}

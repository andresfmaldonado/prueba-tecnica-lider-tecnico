import type { GuiaRepository } from '../application/puertos';
import { Guia } from '../domain/guia';
import type { NumeroGuia, TenantId } from '../domain/identificadores';

const clave = (tenantId: TenantId, numero: NumeroGuia) => `${tenantId.valor}::${numero.valor}`;

/** Guarda copias para que mutar una Guia fuera del repositorio no altere lo «persistido». */
export class GuiaRepositoryEnMemoria implements GuiaRepository {
  private readonly almacen = new Map<string, Guia>();
  /** Cuántas veces se escribió; permite probar que no hay escrituras innecesarias. */
  escrituras = 0;

  async obtener(tenantId: TenantId, numero: NumeroGuia): Promise<Guia | null> {
    const guardada = this.almacen.get(clave(tenantId, numero));
    return guardada ? copiar(guardada) : null;
  }

  async guardar(guia: Guia): Promise<void> {
    this.escrituras++;
    this.almacen.set(clave(guia.tenantId, guia.numero), copiar(guia));
  }

  /** Siembra una guía sin contar como escritura (preparación de escenarios). */
  sembrar(guia: Guia): void {
    this.almacen.set(clave(guia.tenantId, guia.numero), copiar(guia));
  }
}

function copiar(g: Guia): Guia {
  return Guia.reconstruir(g.tenantId, g.numero, g.estado, g.fechaCita);
}

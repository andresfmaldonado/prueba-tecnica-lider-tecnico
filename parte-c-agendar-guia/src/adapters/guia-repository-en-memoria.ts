import type { GuiaRepository } from '../application/puertos';
import { ConflictoDeVersion } from '../domain/errores';
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
    const k = clave(guia.tenantId, guia.numero);
    const versionGuardada = this.almacen.get(k)?.version ?? 0;
    if (versionGuardada !== guia.versionOriginal) {
      throw new ConflictoDeVersion(
        `La guía ${guia.numero.valor} cambió mientras se procesaba: se esperaba la versión ${guia.versionOriginal} y hay la ${versionGuardada}`,
      );
    }
    this.escrituras++;
    this.almacen.set(k, copiar(guia));
  }

  /** Siembra una guía sin contar como escritura (preparación de escenarios). */
  sembrar(guia: Guia): void {
    this.almacen.set(clave(guia.tenantId, guia.numero), copiar(guia));
  }
}

function copiar(g: Guia): Guia {
  return Guia.reconstruir(g.tenantId, g.numero, g.estado, g.fechaCita, g.version);
}

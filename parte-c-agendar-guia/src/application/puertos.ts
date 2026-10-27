import type { Cobertura } from '../domain/cobertura';
import type { FechaCivil } from '../domain/fecha-civil';
import type { Guia } from '../domain/guia';
import type { Ciudad, NumeroGuia, TenantId } from '../domain/identificadores';

export interface CoberturaRepository {
  /** null cuando el cliente no tiene cobertura configurada en la ciudad. */
  obtener(tenantId: TenantId, ciudad: Ciudad): Promise<Cobertura | null>;
}

export interface GuiaRepository {
  obtener(tenantId: TenantId, numero: NumeroGuia): Promise<Guia | null>;
  guardar(guia: Guia): Promise<void>;
}

export interface Reloj {
  /** «Hoy» en la zona horaria de la operación, no la del servidor. */
  hoy(): FechaCivil;
}

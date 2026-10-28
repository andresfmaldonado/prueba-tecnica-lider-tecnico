import { ConflictoDeVersion } from '../domain/errores';
import { Guia } from '../domain/guia';
import type { EstadoGuia } from '../domain/guia';
import { Ciudad, NumeroGuia, TenantId } from '../domain/identificadores';
import { primerDiaDeCobertura } from '../domain/politica-agendamiento';
import type { CoberturaRepository, GuiaRepository, Reloj } from './puertos';

/** Cuántas veces se intenta si otra solicitud modifica la misma guía a la vez. */
export const INTENTOS_POR_CONFLICTO = 2;

export interface AgendarGuiaComando {
  tenant: string;
  numeroGuia: string;
  ciudad: string;
}

export interface AgendarGuiaResultado {
  estado: EstadoGuia;
  /** AAAA-MM-DD; null si la guía quedó SIN_COBERTURA. */
  fechaCita: string | null;
}

export class AgendarGuia {
  constructor(
    private readonly guias: GuiaRepository,
    private readonly coberturas: CoberturaRepository,
    private readonly reloj: Reloj,
  ) {}

  async ejecutar(comando: AgendarGuiaComando): Promise<AgendarGuiaResultado> {
    const tenantId = TenantId.de(comando.tenant);
    const numero = NumeroGuia.de(comando.numeroGuia);
    const ciudad = Ciudad.de(comando.ciudad);

    for (let intento = 1; ; intento++) {
      try {
        return await this.intentar(tenantId, numero, ciudad);
      } catch (error) {
        // Como el caso de uso es idempotente, releer y repetir es seguro.
        if (!(error instanceof ConflictoDeVersion) || intento >= INTENTOS_POR_CONFLICTO) throw error;
      }
    }
  }

  private async intentar(tenantId: TenantId, numero: NumeroGuia, ciudad: Ciudad): Promise<AgendarGuiaResultado> {
    // La guía puede no estar aún en este servicio: el comando trae lo necesario para crearla.
    const guia = (await this.guias.obtener(tenantId, numero)) ?? Guia.pendiente(tenantId, numero);

    // Idempotente: repetir la solicitud no mueve la cita ni vuelve a escribir.
    if (guia.estaAgendada()) return aResultado(guia);

    const cobertura = await this.coberturas.obtener(tenantId, ciudad);
    const fecha = primerDiaDeCobertura(this.reloj.hoy(), cobertura);

    if (fecha !== null) guia.agendar(fecha);
    else guia.marcarSinCobertura();

    if (guia.hayCambios()) await this.guias.guardar(guia);
    return aResultado(guia);
  }
}

function aResultado(guia: Guia): AgendarGuiaResultado {
  return { estado: guia.estado, fechaCita: guia.fechaCita?.toString() ?? null };
}

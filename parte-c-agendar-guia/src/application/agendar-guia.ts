import { GuiaNoEncontrada } from '../domain/errores';
import type { EstadoGuia, Guia } from '../domain/guia';
import { Ciudad, NumeroGuia, TenantId } from '../domain/identificadores';
import { primerDiaDeCobertura } from '../domain/politica-agendamiento';
import type { CoberturaRepository, GuiaRepository, Reloj } from './puertos';

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

    const guia = await this.guias.obtener(tenantId, numero);
    if (guia === null) {
      throw new GuiaNoEncontrada(`La guía ${numero.valor} no existe para el tenant ${tenantId.valor}`);
    }

    // Idempotente: repetir la solicitud no mueve la cita ni vuelve a escribir.
    if (guia.estaAgendada()) return aResultado(guia);

    const cobertura = await this.coberturas.obtener(tenantId, ciudad);
    const fecha = primerDiaDeCobertura(this.reloj.hoy(), cobertura);

    if (fecha !== null) guia.agendar(fecha);
    else guia.marcarSinCobertura();

    await this.guias.guardar(guia);
    return aResultado(guia);
  }
}

function aResultado(guia: Guia): AgendarGuiaResultado {
  return { estado: guia.estado, fechaCita: guia.fechaCita?.toString() ?? null };
}

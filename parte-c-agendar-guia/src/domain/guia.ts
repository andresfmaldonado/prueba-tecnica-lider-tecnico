import { EntradaInvalida, GuiaYaAgendada } from './errores';
import type { FechaCivil } from './fecha-civil';
import type { NumeroGuia, TenantId } from './identificadores';

export type EstadoGuia = 'PENDIENTE_AGENDA' | 'AGENDADA' | 'SIN_COBERTURA';

export class Guia {
  private constructor(
    readonly tenantId: TenantId,
    readonly numero: NumeroGuia,
    private estadoActual: EstadoGuia,
    private fechaCitaActual: FechaCivil | null,
  ) {}

  static pendiente(tenantId: TenantId, numero: NumeroGuia): Guia {
    return new Guia(tenantId, numero, 'PENDIENTE_AGENDA', null);
  }

  /** Rehidrata desde persistencia protegiendo el invariante: solo AGENDADA tiene fecha. */
  static reconstruir(
    tenantId: TenantId,
    numero: NumeroGuia,
    estado: EstadoGuia,
    fechaCita: FechaCivil | null,
  ): Guia {
    if ((estado === 'AGENDADA') !== (fechaCita !== null)) {
      throw new EntradaInvalida(`Estado ${estado} incoherente con la fecha de cita`);
    }
    return new Guia(tenantId, numero, estado, fechaCita);
  }

  get estado(): EstadoGuia {
    return this.estadoActual;
  }

  get fechaCita(): FechaCivil | null {
    return this.fechaCitaActual;
  }

  estaAgendada(): boolean {
    return this.estadoActual === 'AGENDADA';
  }

  agendar(fecha: FechaCivil): void {
    this.exigirNoAgendada();
    this.estadoActual = 'AGENDADA';
    this.fechaCitaActual = fecha;
  }

  marcarSinCobertura(): void {
    this.exigirNoAgendada();
    this.estadoActual = 'SIN_COBERTURA';
    this.fechaCitaActual = null;
  }

  private exigirNoAgendada(): void {
    if (this.estaAgendada()) {
      throw new GuiaYaAgendada(`La guía ${this.numero.valor} ya está agendada para ${this.fechaCitaActual}`);
    }
  }
}

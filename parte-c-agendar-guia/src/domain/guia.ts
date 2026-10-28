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
    private versionActual: number,
    /** Versión leída de persistencia (0 si la guía es nueva): base del control optimista. */
    readonly versionOriginal: number,
  ) {}

  static pendiente(tenantId: TenantId, numero: NumeroGuia): Guia {
    return new Guia(tenantId, numero, 'PENDIENTE_AGENDA', null, 0, 0);
  }

  /** Rehidrata desde persistencia protegiendo el invariante: solo AGENDADA tiene fecha. */
  static reconstruir(
    tenantId: TenantId,
    numero: NumeroGuia,
    estado: EstadoGuia,
    fechaCita: FechaCivil | null,
    version: number,
  ): Guia {
    if ((estado === 'AGENDADA') !== (fechaCita !== null)) {
      throw new EntradaInvalida(`Estado ${estado} incoherente con la fecha de cita`);
    }
    if (!Number.isInteger(version) || version < 0) {
      throw new EntradaInvalida(`Versión inválida: ${version}`);
    }
    return new Guia(tenantId, numero, estado, fechaCita, version, version);
  }

  get estado(): EstadoGuia {
    return this.estadoActual;
  }

  get fechaCita(): FechaCivil | null {
    return this.fechaCitaActual;
  }

  /** Sube con cada cambio de estado; el evento hacia el legado la lleva para descartar los fuera de orden. */
  get version(): number {
    return this.versionActual;
  }

  /** Hay algo que persistir: el agregado cambió desde que se leyó. */
  hayCambios(): boolean {
    return this.versionActual !== this.versionOriginal;
  }

  estaAgendada(): boolean {
    return this.estadoActual === 'AGENDADA';
  }

  agendar(fecha: FechaCivil): void {
    this.exigirNoAgendada();
    this.estadoActual = 'AGENDADA';
    this.fechaCitaActual = fecha;
    this.versionActual++;
  }

  marcarSinCobertura(): void {
    this.exigirNoAgendada();
    // Reintentar sin cobertura nueva no cambia nada: no sube la versión ni hay que escribir.
    if (this.estadoActual === 'SIN_COBERTURA') return;
    this.estadoActual = 'SIN_COBERTURA';
    this.fechaCitaActual = null;
    this.versionActual++;
  }

  private exigirNoAgendada(): void {
    if (this.estaAgendada()) {
      throw new GuiaYaAgendada(`La guía ${this.numero.valor} ya está agendada para ${this.fechaCitaActual}`);
    }
  }
}

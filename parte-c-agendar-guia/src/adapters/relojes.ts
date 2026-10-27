import type { Reloj } from '../application/puertos';
import { FechaCivil } from '../domain/fecha-civil';

export class RelojFijo implements Reloj {
  constructor(private actual: FechaCivil) {}

  hoy(): FechaCivil {
    return this.actual;
  }

  fijar(fecha: FechaCivil): void {
    this.actual = fecha;
  }
}

/** Reloj de producción: la fecha local de la operación (Colombia por defecto), no la del servidor. */
export class RelojSistema implements Reloj {
  constructor(
    private readonly zonaHoraria = 'America/Bogota',
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  hoy(): FechaCivil {
    // El locale en-CA formatea como AAAA-MM-DD.
    const iso = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.zonaHoraria,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(this.ahora());
    return FechaCivil.desdeISO(iso);
  }
}

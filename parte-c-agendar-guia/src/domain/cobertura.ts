import type { DiaSemana, FechaCivil } from './fecha-civil';

/**
 * Días en que el cliente tiene cobertura en una ciudad: patrón semanal más
 * excepciones por fecha (festivos, cierres operativos).
 */
export class Cobertura {
  private readonly dias: ReadonlySet<DiaSemana>;
  private readonly noDisponibles: ReadonlySet<string>;

  constructor(diasSemana: Iterable<DiaSemana>, fechasNoDisponibles: Iterable<FechaCivil> = []) {
    this.dias = new Set(diasSemana);
    this.noDisponibles = new Set([...fechasNoDisponibles].map((f) => f.toString()));
  }

  cubre(fecha: FechaCivil): boolean {
    return this.dias.has(fecha.diaSemana()) && !this.noDisponibles.has(fecha.toString());
  }
}

import type { Cobertura } from './cobertura';
import type { FechaCivil } from './fecha-civil';

/** Días calendario, contados desde mañana, en los que se busca cobertura. */
export const VENTANA_DIAS = 15;

/**
 * Primer día hábil con cobertura entre mañana (hoy + 1) y hoy + 15, ambos incluidos.
 * Devuelve null si no hay cobertura configurada o ninguna fecha de la ventana califica.
 */
export function primerDiaDeCobertura(hoy: FechaCivil, cobertura: Cobertura | null): FechaCivil | null {
  if (cobertura === null) return null;
  for (let d = 1; d <= VENTANA_DIAS; d++) {
    const candidata = hoy.masDias(d);
    if (candidata.esHabil() && cobertura.cubre(candidata)) return candidata;
  }
  return null;
}

import { EntradaInvalida } from './errores';

const MS_POR_DIA = 86_400_000;

/** Día de la semana ISO: 1 = lunes ... 7 = domingo. */
export type DiaSemana = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/**
 * Fecha de calendario sin hora ni zona horaria. La aritmética se hace sobre días
 * enteros, así el cambio de horario o el huso del servidor no afectan la regla.
 */
export class FechaCivil {
  private constructor(private readonly diasDesdeEpoch: number) {}

  static de(anio: number, mes: number, dia: number): FechaCivil {
    const ms = Date.UTC(anio, mes - 1, dia);
    const f = new Date(ms);
    if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) {
      throw new EntradaInvalida(`Fecha inexistente: ${anio}-${mes}-${dia}`);
    }
    return new FechaCivil(ms / MS_POR_DIA);
  }

  static desdeISO(iso: string): FechaCivil {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
    if (!m) throw new EntradaInvalida(`Formato de fecha inválido (se espera AAAA-MM-DD): ${iso}`);
    return FechaCivil.de(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  masDias(n: number): FechaCivil {
    return new FechaCivil(this.diasDesdeEpoch + n);
  }

  diaSemana(): DiaSemana {
    const dow = new Date(this.diasDesdeEpoch * MS_POR_DIA).getUTCDay();
    return (dow === 0 ? 7 : dow) as DiaSemana;
  }

  /** Lunes a viernes. Los festivos se modelan como fechas no disponibles de la cobertura. */
  esHabil(): boolean {
    return this.diaSemana() <= 5;
  }

  equals(otra: FechaCivil): boolean {
    return this.diasDesdeEpoch === otra.diasDesdeEpoch;
  }

  toString(): string {
    return new Date(this.diasDesdeEpoch * MS_POR_DIA).toISOString().slice(0, 10);
  }
}

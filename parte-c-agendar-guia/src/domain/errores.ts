export class ErrorDeDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
  }
}

export class EntradaInvalida extends ErrorDeDominio {}

export class GuiaYaAgendada extends ErrorDeDominio {}

/** La guía cambió entre que se leyó y que se quiso guardar (control optimista). */
export class ConflictoDeVersion extends ErrorDeDominio {}

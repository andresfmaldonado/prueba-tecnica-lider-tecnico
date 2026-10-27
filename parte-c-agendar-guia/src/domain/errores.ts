export class ErrorDeDominio extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = new.target.name;
  }
}

export class EntradaInvalida extends ErrorDeDominio {}

export class GuiaNoEncontrada extends ErrorDeDominio {}

export class GuiaYaAgendada extends ErrorDeDominio {}

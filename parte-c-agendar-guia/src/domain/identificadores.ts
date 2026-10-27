import { EntradaInvalida } from './errores';

function textoNoVacio(valor: string, campo: string): string {
  const limpio = typeof valor === 'string' ? valor.trim() : '';
  if (limpio === '') throw new EntradaInvalida(`${campo} es obligatorio`);
  return limpio;
}

export class TenantId {
  private constructor(readonly valor: string) {}

  static de(valor: string): TenantId {
    return new TenantId(textoNoVacio(valor, 'tenant'));
  }
}

export class NumeroGuia {
  private constructor(readonly valor: string) {}

  static de(valor: string): NumeroGuia {
    return new NumeroGuia(textoNoVacio(valor, 'numeroGuia'));
  }
}

/** Se normaliza (mayúsculas, sin tildes ni espacios sobrantes) para que «Medellín» y «MEDELLIN» sean la misma ciudad. */
export class Ciudad {
  private constructor(readonly valor: string) {}

  static de(valor: string): Ciudad {
    const normalizada = textoNoVacio(valor, 'ciudad')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .toUpperCase();
    return new Ciudad(normalizada);
  }
}

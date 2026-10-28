import { InvalidInput } from './errors';

/** Maximum identifier length: prevents huge inputs and huge error messages. */
export const MAX_IDENTIFIER_LENGTH = 200;

// Control characters, format characters (bidirectional and zero-width marks) and line separators.
const FORBIDDEN_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

function validText(value: unknown, field: string): string {
  const clean = typeof value === 'string' ? value.trim() : '';
  if (clean === '') throw new InvalidInput(`${field} es obligatorio`);
  // Check the length first (cheap), then normalize, so huge inputs are never processed.
  if (clean.length > MAX_IDENTIFIER_LENGTH) {
    throw new InvalidInput(`${field} supera los ${MAX_IDENTIFIER_LENGTH} caracteres`);
  }
  // NFC: a composed and a decomposed "é" are the same identifier.
  const normalized = clean.normalize('NFC');
  if (normalized.length > MAX_IDENTIFIER_LENGTH) {
    throw new InvalidInput(`${field} supera los ${MAX_IDENTIFIER_LENGTH} caracteres`);
  }
  if (FORBIDDEN_CHARACTERS.test(normalized)) {
    throw new InvalidInput(`${field} contiene caracteres no permitidos`);
  }
  return normalized;
}

export class TenantId {
  private constructor(readonly value: string) {}

  static of(value: string): TenantId {
    return new TenantId(validText(value, 'tenant'));
  }
}

export class WaybillNumber {
  private constructor(readonly value: string) {}

  static of(value: string): WaybillNumber {
    return new WaybillNumber(validText(value, 'waybillNumber'));
  }
}

/** Normalized (uppercase, no accents, no extra spaces) so that "Medellín" and "MEDELLIN" are the same city. */
export class City {
  private constructor(readonly value: string) {}

  static of(value: string): City {
    const normalizedValue = validText(value, 'ciudad')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ')
      .toUpperCase();
    return new City(normalizedValue);
  }
}

import { describe, expect, it } from 'vitest';
import { City, Coverage, InvalidInput, CivilDate, WaybillNumber, TenantId } from '../../src';
import { EXPECTED_APPOINTMENT, MON_FRI, MB, command, timeIt, timeItAsync, scenario, resultOf } from './util';

/**
 * S2 · Input validation and fuzzing (OWASP A03 injection).
 * Values arrive as text from other systems: they must be validated before touching the repositories.
 * Test assumption: a reasonable maximum length of 200 characters per field.
 */
const FIELDS = ['tenant', 'waybillNumber', 'city'] as const;

describe('S2 · Validación de entradas', () => {
  // (a) non-text types: they must throw InvalidInput, never TypeError or anything else.
  const NO_TEXT: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['42', 42],
    ['true', true],
    ['{}', {}],
    ['[]', []],
    ['Symbol()', Symbol('x')],
  ];
  for (const field of FIELDS) {
    describe(`(a) campo ${field} con tipo que no es texto`, () => {
      it.each(NO_TEXT)('%s', async (_label, value) => {
        const { useCase } = scenario();
        const r = await resultOf(() => useCase.execute(command({ [field]: value })));
        expect(r).toBeInstanceOf(InvalidInput);
      });
    });
  }

  // (b) length: 1 MB is rejected in under 500 ms; 200 is accepted; 201 and 10,000 are rejected.
  for (const field of FIELDS) {
    it(`(b) ${field} de 1 MB se rechaza con InvalidInput en < 500 ms`, async () => {
      const { useCase } = scenario();
      const { ms, result } = await timeItAsync(() => useCase.execute(command({ [field]: 'x'.repeat(MB) })));
      console.log(`[MEDIDA] S2b ${field} 1 MB: ${ms.toFixed(1)} ms -> ${result instanceof Error ? result.name : 'ACEPTADO'}`);
      expect(result).toBeInstanceOf(InvalidInput);
      expect(ms).toBeLessThan(500);
    });
  }
  for (const field of FIELDS) {
    it.each([
      [200, false],
      [201, true],
      [10_000, true],
    ])(`(b) ${field} de %i caracteres (rechazo=%s)`, async (size, rejection) => {
      const { useCase } = scenario();
      const r = await resultOf(() => useCase.execute(command({ [field]: 'x'.repeat(size) })));
      console.log(`[MEDIDA] S2b ${field} ${size} caracteres -> ${r instanceof Error ? r.name : 'ACEPTADO'}`);
      if (rejection) expect(r).toBeInstanceOf(InvalidInput);
      else expect(r).not.toBeInstanceOf(Error);
    });
  }

  // (c) control characters inside the value.
  const CONTROL: [string, string][] = [
    ['NUL \\u0000', '\u0000'],
    ['LF \\n', '\n'],
    ['CR \\r', '\r'],
    ['TAB \\t', '\t'],
    ['ESC \\u001b', '\u001b'],
  ];
  for (const field of FIELDS) {
    it.each(CONTROL)(`(c) ${field} con %s dentro del valor -> InvalidInput`, async (_label, ch) => {
      const { useCase } = scenario();
      const r = await resultOf(() => useCase.execute(command({ [field]: `AB${ch}CD` })));
      expect(r).toBeInstanceOf(InvalidInput);
    });
  }

  // (d) injection strings: a clean rejection, or acceptance with the stored value identical to the trimmed one.
  const LOADS = ["'; DROP TABLE guias;--", '<script>alert(1)</script>', '../../etc/passwd', '${jndi:ldap://x/a}', '%00', "' OR '1'='1"];
  for (const field of FIELDS) {
    it.each(LOADS)(`(d) ${field} = %s: nunca otro error; si se acepta, se guarda tal cual`, async (load) => {
      const { waybills, coverages, useCase } = scenario();
      coverages.define(TenantId.of('banco-a'), City.of('Medellín'), new Coverage(MON_FRI));
      const r = await resultOf(() => useCase.execute(command({ [field]: load })));
      if (r instanceof InvalidInput) return;
      expect(r).not.toBeInstanceOf(Error);
      if (field === 'tenant') {
        const g = await waybills.find(TenantId.of(load), WaybillNumber.of('G-1'));
        expect(g?.tenantId.value).toBe(load.trim());
      } else if (field === 'waybillNumber') {
        const g = await waybills.find(TenantId.of('banco-a'), WaybillNumber.of(load));
        expect(g?.waybillNo.value).toBe(load.trim());
      } else {
        expect(City.of(load).value).toBe(load.trim().toUpperCase());
      }
    });
  }

  // (e) Object.prototype property names as data: they are treated as data and contaminate nothing.
  for (const field of FIELDS) {
    it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(`(e) ${field} = %s se trata como dato`, async (value) => {
      const { waybills, coverages, useCase } = scenario();
      // Coverage defined for the test value, with the rest of the data valid.
      const tenant = field === 'tenant' ? value : 'banco-a';
      const waybillNo = field === 'waybillNumber' ? value : 'G-1';
      const city = field === 'city' ? value : 'Medellín';
      coverages.define(TenantId.of(tenant), City.of(city), new Coverage(MON_FRI));
      const r = await useCase.execute({ tenant, waybillNumber: waybillNo, city });
      expect(r).toEqual({ status: 'AGENDADA', appointmentDate: EXPECTED_APPOINTMENT });
      expect(waybills.writes).toBe(1);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
      // Isolation remains intact: another tenant with the same number does not inherit the appointment.
      const other = await useCase.execute({ tenant: 'otro-banco', waybillNumber: 'G-1', city: 'Medellín' });
      expect(other).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
    });
  }

  // (f) ReDoS / City.of time with pathological strings: it must finish in under 500 ms.
  it('(f) ciudad = 1.000.000 de espacios + "a" termina en < 500 ms', () => {
    const { ms, result } = timeIt(() => City.of(' '.repeat(1_000_000) + 'a'));
    console.log(`[MEDIDA] S2f espacios+a: ${ms.toFixed(1)} ms -> ${result instanceof Error ? result.name : 'ACEPTADO'}`);
    expect(ms).toBeLessThan(500);
  });
  it('(f) ciudad = "a" + 1.000.000 de espacios + "b" termina en < 500 ms', () => {
    const { ms, result } = timeIt(() => City.of('a' + ' '.repeat(1_000_000) + 'b'));
    console.log(`[MEDIDA] S2f espacios internos: ${ms.toFixed(1)} ms -> ${result instanceof Error ? result.name : 'ACEPTADO'}`);
    expect(ms).toBeLessThan(500);
  });
  it('(f) ciudad con 100.000 marcas diacríticas termina en < 500 ms', () => {
    const { ms, result } = timeIt(() => City.of('a' + '́'.repeat(100_000)));
    console.log(`[MEDIDA] S2f diacríticos: ${ms.toFixed(1)} ms -> ${result instanceof Error ? result.name : 'ACEPTADO'}`);
    expect(ms).toBeLessThan(500);
  });

  // (g) malformed or non-existent ISO dates.
  it.each(['2026-02-30', '0000-00-00', '2026-1-1', '', '2026-13-01', ' 2026-10-27'])(
    '(g) CivilDate.fromISO(%j) -> InvalidInput',
    (iso) => {
      expect(() => CivilDate.fromISO(iso)).toThrow(InvalidInput);
    },
  );
  it('(g) fromISO("9999-12-31").masDias(1) no produce texto mal formado', () => {
    const r = (() => {
      try {
        return CivilDate.fromISO('9999-12-31').plusDays(1).toString();
      } catch (e) {
        return e;
      }
    })();
    console.log(`[MEDIDA] S2g 9999-12-31 + 1 día -> ${r instanceof Error ? r.name : JSON.stringify(r)}`);
    if (r instanceof InvalidInput) return;
    expect(r).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

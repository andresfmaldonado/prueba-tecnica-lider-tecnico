import { describe, expect, it } from 'vitest';
import { City, Coverage, WaybillNumber, TenantId } from '../../src';
import { EXPECTED_APPOINTMENT, MON_FRI, scenario } from './util';

/**
 * S1 · Multitenant isolation (OWASP A01 access control, A04 insecure design).
 * Tenant A has Mon–Fri coverage in Medellín; tenant B has no coverage in that city.
 * Each waybill must keep its own state, and each must generate one write.
 */
async function executePair(tA: string, nA: string, tB: string, nB: string) {
  const { waybills, coverages, useCase } = scenario();
  coverages.define(TenantId.of(tA), City.of('Medellín'), new Coverage(MON_FRI));
  const a = await useCase.execute({ tenant: tA, waybillNumber: nA, city: 'Medellín' });
  const b = await useCase.execute({ tenant: tB, waybillNumber: nB, city: 'Medellín' });
  const waybillA = await waybills.find(TenantId.of(tA), WaybillNumber.of(nA));
  const waybillB = await waybills.find(TenantId.of(tB), WaybillNumber.of(nB));
  return { waybills, a, b, waybillA, waybillB };
}

describe('S1 · Aislamiento multitenant', () => {
  it('línea base: mismo número de guía en dos tenants son dos guías independientes', async () => {
    const r = await executePair('banco-a', 'G-1', 'banco-b', 'G-1');
    expect(r.a).toEqual({ status: 'AGENDADA', appointmentDate: EXPECTED_APPOINTMENT });
    expect(r.b).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
    expect(r.waybillA?.status).toBe('AGENDADA');
    expect(r.waybillB?.status).toBe('SIN_COBERTURA');
    expect(r.waybills.writes).toBe(2);
  });

  // (a) and (b): ambiguous "tenant::waybill" concatenation. Each pair must produce two distinct waybills.
  it.each([
    ['(a) tenant "a::b" + guía "c" vs tenant "a" + guía "b::c"', 'a::b', 'c', 'a', 'b::c'],
    ['(b) tenant "x:" + guía "y" vs tenant "x" + guía ":y"', 'x:', 'y', 'x', ':y'],
    ['(b) tenant "t" + guía "x::y" vs tenant "t::x" + guía "y"', 't', 'x::y', 't::x', 'y'],
    ['(b) tenant "a:::b" + guía "c" vs tenant "a" + guía ":b::c"', 'a:::b', 'c', 'a', ':b::c'],
  ])('%s: no colisionan', async (_label, tA, nA, tB, nB) => {
    const r = await executePair(tA, nA, tB, nB);
    expect(r.b).toEqual({ status: 'SIN_COBERTURA', appointmentDate: null });
    expect(r.waybillA?.status).toBe('AGENDADA');
    expect(r.waybillB?.status).toBe('SIN_COBERTURA');
    expect(r.waybills.writes).toBe(2);
  });

  // (c) internal spaces: distinct tenants must remain isolated.
  it.each([
    ['(c) "banco a" vs "banco  a" (doble espacio)', 'banco a', 'banco  a'],
  ])('%s: son tenants aislados', async (_label, tA, tB) => {
    const r = await executePair(tA, 'G-1', tB, 'G-1');
    expect(r.b.status).toBe('SIN_COBERTURA');
    expect(r.waybillB?.status).toBe('SIN_COBERTURA');
    expect(r.waybills.writes).toBe(2);
  });

  // (d) uppercase: a decision to document. They are expected to be distinct, isolated identifiers.
  it('(d) "Banco-A" y "banco-a" son identificadores distintos (sensibles a mayúsculas, documentado)', async () => {
    expect(TenantId.of('Banco-A').value).not.toBe(TenantId.of('banco-a').value);
    const r = await executePair('Banco-A', 'G-1', 'banco-a', 'G-1');
    expect(r.a.status).toBe('AGENDADA');
    expect(r.b.status).toBe('SIN_COBERTURA');
    expect(r.waybills.writes).toBe(2);
  });

  // (e) Unicode: NFC and NFD represent the same text and must be treated as the same identifier.
  it('(e) tenant NFC "café" y NFD "cafe+acento" se tratan como el mismo tenant', async () => {
    const nfc = 'café';
    const nfd = 'café';
    const { waybills, coverages, useCase } = scenario();
    coverages.define(TenantId.of(nfc), City.of('Medellín'), new Coverage(MON_FRI));
    const r1 = await useCase.execute({ tenant: nfc, waybillNumber: 'G-1', city: 'Medellín' });
    const r2 = await useCase.execute({ tenant: nfd, waybillNumber: 'G-1', city: 'Medellín' });
    expect(r2).toEqual(r1); // same waybill: idempotent retry
    expect(waybills.writes).toBe(1);
  });

  it('(e) número de guía NFC "G-é" y NFD "G-e+acento" se tratan como la misma guía', async () => {
    const { waybills, coverages, useCase } = scenario();
    coverages.define(TenantId.of('banco-a'), City.of('Medellín'), new Coverage(MON_FRI));
    const r1 = await useCase.execute({ tenant: 'banco-a', waybillNumber: 'G-é', city: 'Medellín' });
    const r2 = await useCase.execute({ tenant: 'banco-a', waybillNumber: 'G-é', city: 'Medellín' });
    expect(r2).toEqual(r1);
    expect(waybills.writes).toBe(1);
  });

  it('(e) ciudad NFC "Medellín" y NFD dan la misma cobertura (la ciudad sí se normaliza)', async () => {
    const { coverages, useCase } = scenario();
    coverages.define(TenantId.of('banco-a'), City.of('Medellín'), new Coverage(MON_FRI));
    const r = await useCase.execute({ tenant: 'banco-a', waybillNumber: 'G-2', city: 'Medellín' });
    expect(r).toEqual({ status: 'AGENDADA', appointmentDate: EXPECTED_APPOINTMENT });
  });
});

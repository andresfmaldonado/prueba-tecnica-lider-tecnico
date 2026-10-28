import { describe, expect, it } from 'vitest';
import { VersionConflict, InvalidInput, CivilDate, Waybill, InMemoryWaybillRepository, WaybillAlreadyScheduled, MAX_IDENTIFIER_LENGTH, WaybillNumber, TenantId } from '../../src';
import { MB, scenario, resultOf, command } from './util';

/**
 * S3 · Information leakage in errors (OWASP A09, logging and monitoring).
 * The error message: at most 300 characters, without the full input, without system paths,
 * without the stack and without data from another tenant.
 */
const FORBIDDEN_PATHS = ['/Users', 'node_modules'];

function reviewMessage(err: unknown, fullInput: string, foreignData?: string): void {
  expect(err).toBeInstanceOf(Error);
  const msg = (err as Error).message;
  expect(msg.length).toBeLessThanOrEqual(300);
  expect(msg).not.toContain(fullInput);
  for (const route of FORBIDDEN_PATHS) expect(msg).not.toContain(route);
  expect(msg).not.toMatch(/\n\s+at\s/); // the stack does not travel inside the message
  if (foreignData) expect(msg).not.toContain(foreignData);
}

describe('S3 · Fuga de información en errores', () => {
  it('entrada de 1 MB solo en blancos: InvalidInput con mensaje corto y sin la entrada', async () => {
    const { useCase } = scenario();
    const input = ' '.repeat(MB);
    const r = await resultOf(() => useCase.execute(command({ tenant: input })));
    expect(r).toBeInstanceOf(InvalidInput);
    reviewMessage(r, input);
  });

  it('VersionConflict con número de guía normal: mensaje acotado, sin datos de otro tenant', async () => {
    const repo = new InMemoryWaybillRepository();
    // Same waybill in the victim tenant (banco-a, version 2) and in another tenant with its own data (banco-b-secreto, version 7).
    repo.seed(Waybill.rehydrate(TenantId.of('banco-a'), WaybillNumber.of('G-1'), 'PENDIENTE_AGENDA', null, 2));
    repo.seed(Waybill.rehydrate(TenantId.of('banco-b-secreto'), WaybillNumber.of('G-1'), 'AGENDADA', CivilDate.fromISO('2026-10-29'), 7));
    const pending = Waybill.pending(TenantId.of('banco-a'), WaybillNumber.of('G-1'));
    const r = await resultOf(() => repo.save(pending));
    expect(r).toBeInstanceOf(VersionConflict);
    reviewMessage(r, 'banco-b-secreto', 'banco-b-secreto');
  });

  it('WaybillAlreadyScheduled con número de guía normal: mensaje acotado y sin stack', () => {
    const g = Waybill.pending(TenantId.of('banco-a'), WaybillNumber.of('G-1'));
    g.schedule(CivilDate.fromISO('2026-10-29'));
    const r = resultOf(async () => g.schedule(CivilDate.fromISO('2026-10-30')));
    return r.then((e) => {
      expect(e).toBeInstanceOf(WaybillAlreadyScheduled);
      reviewMessage(e, 'banco-a-no-debe-aparecer', 'banco-a-no-debe-aparecer');
    });
  });

  it('error de CivilDate.fromISO con entrada de 1 MB: el mensaje no repite la entrada (<= 300 caracteres)', () => {
    const input = 'x'.repeat(MB);
    let err: unknown;
    try {
      CivilDate.fromISO(input);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(InvalidInput);
    reviewMessage(err, input);
  });

  it('WaybillAlreadyScheduled con el número de guía más largo permitido: el mensaje no lo repite completo', () => {
    const waybillNo = 'N'.repeat(MAX_IDENTIFIER_LENGTH);
    const g = Waybill.pending(TenantId.of('banco-a'), WaybillNumber.of(waybillNo));
    g.schedule(CivilDate.fromISO('2026-10-29'));
    let err: unknown;
    try {
      g.schedule(CivilDate.fromISO('2026-10-30'));
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(WaybillAlreadyScheduled);
    reviewMessage(err, waybillNo);
  });

  it('un número de guía de 1 MB ya no llega a existir: se rechaza al construirlo (H2 corregido)', () => {
    expect(() => WaybillNumber.of('N'.repeat(MB))).toThrow(InvalidInput);
  });

  it('VersionConflict con el número de guía más largo permitido: el mensaje no lo repite completo', async () => {
    const waybillNo = 'N'.repeat(MAX_IDENTIFIER_LENGTH);
    const repo = new InMemoryWaybillRepository();
    repo.seed(Waybill.rehydrate(TenantId.of('banco-a'), WaybillNumber.of(waybillNo), 'PENDIENTE_AGENDA', null, 2));
    const r = await resultOf(() => repo.save(Waybill.pending(TenantId.of('banco-a'), WaybillNumber.of(waybillNo))));
    expect(r).toBeInstanceOf(VersionConflict);
    reviewMessage(r, waybillNo);
  });

  it('los errores no exponen el stack en el message', async () => {
    const { useCase } = scenario();
    const r = await resultOf(() => useCase.execute(command({ city: null })));
    expect(r).toBeInstanceOf(InvalidInput);
    expect((r as Error).message).not.toContain('\n');
    expect((r as Error).message).not.toMatch(/\bat\s+\S+\s+\(/);
  });
});

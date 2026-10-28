import { describe, expect, it } from 'vitest';
import { EntradaInvalida, FechaCivil, Guia, GuiaYaAgendada, NumeroGuia, RelojSistema, TenantId } from '../src';

describe('FechaCivil', () => {
  it('calcula el día de la semana ISO', () => {
    expect(FechaCivil.desdeISO('2026-10-26').diaSemana()).toBe(1); // lunes
    expect(FechaCivil.desdeISO('2026-11-01').diaSemana()).toBe(7); // domingo
  });

  it('suma días cruzando mes y año, y años bisiestos', () => {
    expect(FechaCivil.desdeISO('2026-12-31').masDias(1).toString()).toBe('2027-01-01');
    expect(FechaCivil.desdeISO('2028-02-28').masDias(1).toString()).toBe('2028-02-29');
  });

  it('solo lunes a viernes son hábiles', () => {
    const lunes = FechaCivil.desdeISO('2026-10-26');
    const habiles = [0, 1, 2, 3, 4, 5, 6].map((d) => lunes.masDias(d).esHabil());
    expect(habiles).toEqual([true, true, true, true, true, false, false]);
  });

  it.each(['2026-02-30', '2026-13-01', '26-10-27', 'mañana'])('rechaza la fecha inválida %s', (texto) => {
    expect(() => FechaCivil.desdeISO(texto)).toThrow(EntradaInvalida);
  });
});

describe('Guia', () => {
  const tenant = TenantId.de('banco-a');
  const numero = NumeroGuia.de('G-1');

  it('una guía agendada no puede agendarse ni marcarse sin cobertura de nuevo', () => {
    const guia = Guia.pendiente(tenant, numero);
    guia.agendar(FechaCivil.desdeISO('2026-10-28'));

    expect(() => guia.agendar(FechaCivil.desdeISO('2026-10-29'))).toThrow(GuiaYaAgendada);
    expect(() => guia.marcarSinCobertura()).toThrow(GuiaYaAgendada);
  });

  it('no se puede reconstruir un estado incoherente (AGENDADA sin fecha)', () => {
    expect(() => Guia.reconstruir(tenant, numero, 'AGENDADA', null, 0)).toThrow(EntradaInvalida);
    expect(() =>
      Guia.reconstruir(tenant, numero, 'SIN_COBERTURA', FechaCivil.desdeISO('2026-10-28'), 0),
    ).toThrow(EntradaInvalida);
  });

  it('la versión sube con cada cambio de estado y versionOriginal conserva la leída', () => {
    const guia = Guia.reconstruir(tenant, numero, 'PENDIENTE_AGENDA', null, 3);
    expect([guia.version, guia.versionOriginal, guia.hayCambios()]).toEqual([3, 3, false]);

    guia.agendar(FechaCivil.desdeISO('2026-10-28'));

    expect([guia.version, guia.versionOriginal, guia.hayCambios()]).toEqual([4, 3, true]);
  });

  it('marcar SIN_COBERTURA una guía que ya lo está no cambia la versión', () => {
    const guia = Guia.reconstruir(tenant, numero, 'SIN_COBERTURA', null, 1);

    guia.marcarSinCobertura();

    expect(guia.version).toBe(1);
    expect(guia.hayCambios()).toBe(false);
  });

  it.each([-1, 1.5, Number.NaN])('rechaza la versión inválida %s', (version) => {
    expect(() => Guia.reconstruir(tenant, numero, 'PENDIENTE_AGENDA', null, version)).toThrow(EntradaInvalida);
  });
});

describe('RelojSistema', () => {
  it('usa la fecha de Bogotá, no la UTC: 03:00 UTC del 28 sigue siendo 27 en Colombia', () => {
    const reloj = new RelojSistema('America/Bogota', () => new Date('2026-10-28T03:00:00Z'));
    expect(reloj.hoy().toString()).toBe('2026-10-27');
  });

  it('pasa al día siguiente cuando en Bogotá ya es medianoche', () => {
    const reloj = new RelojSistema('America/Bogota', () => new Date('2026-10-28T05:00:00Z'));
    expect(reloj.hoy().toString()).toBe('2026-10-28');
  });
});

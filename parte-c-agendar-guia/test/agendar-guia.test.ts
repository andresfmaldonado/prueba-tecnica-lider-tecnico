import { describe, expect, it } from 'vitest';
import {
  AgendarGuia,
  Ciudad,
  Cobertura,
  CoberturaRepositoryEnMemoria,
  EntradaInvalida,
  FechaCivil,
  Guia,
  GuiaNoEncontrada,
  GuiaRepositoryEnMemoria,
  NumeroGuia,
  RelojFijo,
  TenantId,
} from '../src';
import type { DiaSemana } from '../src';

const LUN_A_VIE: DiaSemana[] = [1, 2, 3, 4, 5];
const [LUN, MAR, , , VIE, SAB, DOM] = [1, 2, 3, 4, 5, 6, 7] as const;

// Martes 2026-10-27 salvo que la prueba diga otra cosa.
const MARTES = FechaCivil.desdeISO('2026-10-27');

const fecha = FechaCivil.desdeISO;
const rango = (hoy: FechaCivil, desde: number, hasta: number): FechaCivil[] =>
  Array.from({ length: hasta - desde + 1 }, (_, i) => hoy.masDias(desde + i));

function escenario(opciones: { hoy?: FechaCivil } = {}) {
  const guias = new GuiaRepositoryEnMemoria();
  const coberturas = new CoberturaRepositoryEnMemoria();
  const reloj = new RelojFijo(opciones.hoy ?? MARTES);
  const agendar = new AgendarGuia(guias, coberturas, reloj);

  return {
    agendar,
    guias,
    coberturas,
    reloj,
    guiaPendiente(tenant = 'banco-a', numero = 'G-1') {
      guias.sembrar(Guia.pendiente(TenantId.de(tenant), NumeroGuia.de(numero)));
    },
    cobertura(cob: Cobertura, tenant = 'banco-a', ciudad = 'Medellin') {
      coberturas.definir(TenantId.de(tenant), Ciudad.de(ciudad), cob);
    },
    ejecutar(sobreescribe: Partial<{ tenant: string; numeroGuia: string; ciudad: string }> = {}) {
      return agendar.ejecutar({ tenant: 'banco-a', numeroGuia: 'G-1', ciudad: 'Medellin', ...sobreescribe });
    },
    async estadoGuardado(tenant = 'banco-a', numero = 'G-1') {
      const g = await guias.obtener(TenantId.de(tenant), NumeroGuia.de(numero));
      return g && { estado: g.estado, fechaCita: g.fechaCita?.toString() ?? null };
    },
  };
}

describe('Agendar una guía — regla de la cita', () => {
  it('agenda mañana cuando mañana es hábil y tiene cobertura', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE));

    expect(await e.ejecutar()).toEqual({ estado: 'AGENDADA', fechaCita: '2026-10-28' });
    expect(await e.estadoGuardado()).toEqual({ estado: 'AGENDADA', fechaCita: '2026-10-28' });
  });

  it('toma el primer día de cobertura aunque no sea mañana', async () => {
    const e = escenario(); // martes; cobertura solo viernes
    e.guiaPendiente();
    e.cobertura(new Cobertura([VIE]));

    expect((await e.ejecutar()).fechaCita).toBe('2026-10-30');
  });

  it('«a partir de mañana»: hoy no cuenta aunque sea día de cobertura', async () => {
    const e = escenario(); // hoy martes; cobertura solo martes
    e.guiaPendiente();
    e.cobertura(new Cobertura([MAR]));

    expect((await e.ejecutar()).fechaCita).toBe('2026-11-03'); // martes siguiente
  });

  it('elige la fecha más cercana entre varios días de cobertura', async () => {
    const e = escenario(); // martes; cobertura lunes y viernes
    e.guiaPendiente();
    e.cobertura(new Cobertura([LUN, VIE]));

    expect((await e.ejecutar()).fechaCita).toBe('2026-10-30');
  });
});

describe('Agendar una guía — fines de semana', () => {
  it.each([
    ['viernes', '2026-10-30'],
    ['sábado', '2026-10-31'],
    ['domingo', '2026-11-01'],
  ])('si hoy es %s, salta el fin de semana y agenda el lunes', async (_dia, hoy) => {
    const e = escenario({ hoy: fecha(hoy) });
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE));

    expect((await e.ejecutar()).fechaCita).toBe('2026-11-02');
  });

  it('un día de cobertura en sábado o domingo no es hábil: queda SIN_COBERTURA', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura([SAB, DOM]));

    expect(await e.ejecutar()).toEqual({ estado: 'SIN_COBERTURA', fechaCita: null });
  });

  it('cruza fin de mes y de año sin errores de calendario', async () => {
    const e = escenario({ hoy: fecha('2026-12-31') }); // jueves
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE));

    expect((await e.ejecutar()).fechaCita).toBe('2027-01-01');
  });
});

describe('Agendar una guía — sin cobertura', () => {
  it('sin cobertura configurada para la ciudad: SIN_COBERTURA y se persiste', async () => {
    const e = escenario();
    e.guiaPendiente();

    expect(await e.ejecutar()).toEqual({ estado: 'SIN_COBERTURA', fechaCita: null });
    expect(await e.estadoGuardado()).toEqual({ estado: 'SIN_COBERTURA', fechaCita: null });
  });

  it('cobertura sin ningún día: SIN_COBERTURA', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura([]));

    expect((await e.ejecutar()).estado).toBe('SIN_COBERTURA');
  });

  it('la cobertura de otra ciudad no aplica', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE), 'banco-a', 'Bogota');

    expect((await e.ejecutar({ ciudad: 'Medellin' })).estado).toBe('SIN_COBERTURA');
  });

  it('una guía SIN_COBERTURA se puede reintentar cuando aparece cobertura', async () => {
    const e = escenario();
    e.guiaPendiente();
    expect((await e.ejecutar()).estado).toBe('SIN_COBERTURA');

    e.cobertura(new Cobertura(LUN_A_VIE));

    expect(await e.ejecutar()).toEqual({ estado: 'AGENDADA', fechaCita: '2026-10-28' });
  });
});

describe('Agendar una guía — ventana de 15 días', () => {
  it('el día 15 todavía cuenta', async () => {
    const e = escenario(); // hoy + 15 = miércoles 2026-11-11
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE, rango(MARTES, 1, 14))); // festivos/cierres los días 1..14

    expect((await e.ejecutar()).fechaCita).toBe('2026-11-11');
  });

  it('el día 16 ya queda fuera de la ventana', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE, rango(MARTES, 1, 15))); // el día 16 sí tendría cobertura

    expect(await e.ejecutar()).toEqual({ estado: 'SIN_COBERTURA', fechaCita: null });
  });

  it('una fecha no disponible (festivo) se salta aunque su día de semana tenga cobertura', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE, [fecha('2026-10-28')])); // mañana es festivo

    expect((await e.ejecutar()).fechaCita).toBe('2026-10-29');
  });
});

describe('Agendar una guía — idempotencia', () => {
  it('si ya está agendada devuelve la cita existente sin recalcular ni escribir', async () => {
    const e = escenario();
    e.guias.sembrar(
      Guia.reconstruir(TenantId.de('banco-a'), NumeroGuia.de('G-1'), 'AGENDADA', fecha('2026-10-29')),
    );
    e.cobertura(new Cobertura([LUN])); // si recalculara, daría otra fecha

    expect(await e.ejecutar()).toEqual({ estado: 'AGENDADA', fechaCita: '2026-10-29' });
    expect(e.guias.escrituras).toBe(0);
  });

  it('ejecutar dos veces seguidas da la misma cita y escribe una sola vez', async () => {
    const e = escenario();
    e.guiaPendiente();
    e.cobertura(new Cobertura(LUN_A_VIE));

    const primera = await e.ejecutar();
    e.reloj.fijar(fecha('2026-11-02')); // pasan los días; la cita no se mueve
    const segunda = await e.ejecutar();

    expect(segunda).toEqual(primera);
    expect(e.guias.escrituras).toBe(1);
  });
});

describe('Agendar una guía — entradas y errores', () => {
  it('guía inexistente: GuiaNoEncontrada', async () => {
    const e = escenario();
    e.cobertura(new Cobertura(LUN_A_VIE));

    await expect(e.ejecutar()).rejects.toBeInstanceOf(GuiaNoEncontrada);
  });

  it.each([
    ['tenant', { tenant: '  ' }],
    ['numeroGuia', { numeroGuia: '' }],
    ['ciudad', { ciudad: ' ' }],
  ])('rechaza %s vacío antes de tocar los repositorios', async (_campo, entrada) => {
    const e = escenario();
    e.guiaPendiente();

    await expect(e.ejecutar(entrada)).rejects.toBeInstanceOf(EntradaInvalida);
    expect(e.guias.escrituras).toBe(0);
  });

  it('«Medellín», «MEDELLIN» y « medellin » son la misma ciudad', async () => {
    const e = escenario();
    e.cobertura(new Cobertura(LUN_A_VIE), 'banco-a', 'Medellín');

    for (const [i, ciudad] of ['MEDELLIN', ' medellin ', 'Medellín'].entries()) {
      e.guiaPendiente('banco-a', `G-${i}`);
      const r = await e.ejecutar({ numeroGuia: `G-${i}`, ciudad });
      expect(r.estado).toBe('AGENDADA');
    }
  });
});

describe('Agendar una guía — multitenancy', () => {
  it('la guía de un tenant no es visible desde otro, aunque el número coincida', async () => {
    const e = escenario();
    e.guiaPendiente('banco-a', 'G-1');
    e.cobertura(new Cobertura(LUN_A_VIE), 'banco-b');

    await expect(e.ejecutar({ tenant: 'banco-b', numeroGuia: 'G-1' })).rejects.toBeInstanceOf(GuiaNoEncontrada);
    expect(await e.estadoGuardado('banco-a')).toEqual({ estado: 'PENDIENTE_AGENDA', fechaCita: null });
  });

  it('cada tenant usa su propia cobertura para la misma ciudad y la misma guía', async () => {
    const e = escenario(); // martes
    e.guiaPendiente('banco-a', 'G-1');
    e.guiaPendiente('banco-b', 'G-1');
    e.cobertura(new Cobertura([MAR, VIE]), 'banco-a'); // próximo: viernes
    e.cobertura(new Cobertura([LUN]), 'banco-b'); // próximo: lunes siguiente

    expect((await e.ejecutar({ tenant: 'banco-a' })).fechaCita).toBe('2026-10-30');
    expect((await e.ejecutar({ tenant: 'banco-b' })).fechaCita).toBe('2026-11-02');
  });
});

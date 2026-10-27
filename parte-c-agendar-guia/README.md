# Parte C — Agendar una guía

Caso de uso central del servicio de Agendamiento, con arquitectura hexagonal. TypeScript + Vitest, sin base de datos, Docker ni API HTTP.

## Ejecutar

Requiere Node ≥ 20.

```bash
npm install && npm test
```

`npm run typecheck` valida los tipos.

## Entrada y salida

```ts
agendarGuia.ejecutar({ tenant: 'banco-a', numeroGuia: 'G-1', ciudad: 'Medellín' })
// → { estado: 'AGENDADA', fechaCita: '2026-10-28' }
// → { estado: 'SIN_COBERTURA', fechaCita: null }
```

## Estructura

```
src/domain/        Reglas puras: FechaCivil, Cobertura, Guia, política de agendamiento
src/application/   Caso de uso AgendarGuia y puertos (GuiaRepository, CoberturaRepository, Reloj)
src/adapters/      Adaptadores en memoria y relojes (RelojFijo, RelojSistema)
test/              Pruebas del caso de uso y del dominio
```

El dominio no importa nada de `application` ni de `adapters`. El caso de uso solo conoce los puertos.

## La regla

La cita es el **primer día hábil con cobertura entre mañana (hoy + 1) y hoy + 15**, ambos incluidos. Si ninguna fecha califica, la guía queda `SIN_COBERTURA`.

## Supuestos y decisiones

- **Día hábil = lunes a viernes.** Un día de cobertura en sábado o domingo no es hábil, así que no genera cita.
- **Festivos y cierres** se modelan como *fechas no disponibles* de la cobertura (`Cobertura(dias, fechasNoDisponibles)`). Con un patrón solo semanal la ventana de 15 días nunca sería determinante, porque cualquier día de la semana aparece en los primeros 7. Las excepciones por fecha son lo que la hace relevante.
- **«Hoy» sale del puerto `Reloj`** como fecha civil, sin hora. `RelojSistema` usa `America/Bogota` por defecto, para que un servidor en UTC no adelante el día por la noche.
- **Idempotencia:** si la guía ya está agendada, se devuelve su cita sin recalcular ni escribir. Una guía `SIN_COBERTURA` sí se puede reintentar, porque la cobertura puede haber cambiado.
- **Ciudad normalizada** (mayúsculas, sin tildes ni espacios sobrantes): «Medellín» y «MEDELLIN» son la misma.
- **Multitenancy:** todos los repositorios se consultan por `tenant`; una guía de otro tenant se comporta como inexistente (`GuiaNoEncontrada`).
- **Guía inexistente** lanza `GuiaNoEncontrada`; entradas vacías lanzan `EntradaInvalida` antes de tocar los repositorios.

## Fuera de alcance

- **Concurrencia:** en producción, dos solicitudes simultáneas para la misma guía necesitan control optimista (columna de versión) o una restricción única en la BD. El repositorio en memoria no lo simula.
- **Persistencia, HTTP y eventos** (`GuiaAgendada` hacia la sincronización con el legado, ver Parte A).

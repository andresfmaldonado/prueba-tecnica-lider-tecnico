# Parte C — Agendar una guía

Caso de uso central del servicio de Agendamiento, con arquitectura hexagonal. TypeScript + Vitest, sin base de datos, Docker ni API HTTP.

## Ejecutar

Requiere Node ≥ 20.

```bash
npm install && npm test
```

`npm run typecheck` valida los tipos. `npm run coverage` mide la cobertura (hoy ~98 % de sentencias y ~96 % de ramas) y falla si baja del 90 % que promete la Parte A.

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
- **Festivos y cierres** se modelan como *fechas no disponibles* de la cobertura (`Cobertura(dias, fechasNoDisponibles)`). Con un patrón solo semanal la ventana de 15 días nunca sería determinante, porque cualquier día de la semana aparece en los primeros 7. En producción, el adaptador de cobertura compone el calendario de festivos del país con las excepciones del cliente y las entrega como `fechasNoDisponibles`; el caso de uso conserva sus tres puertos.
- **«Hoy» sale del puerto `Reloj`** como fecha civil, sin hora. `RelojSistema` usa `America/Bogota` por defecto, para que un servidor en UTC no adelante el día por la noche; con varios países, la zona se recibe por tenant.
- **Idempotencia:** si la guía ya está agendada, se devuelve su cita sin recalcular ni escribir. Una guía `SIN_COBERTURA` sí se puede reintentar, porque la cobertura puede haber cambiado; si sigue sin cobertura, no escribe.
- **Guía que aún no existe en el servicio:** se crea pendiente con los datos del comando (tenant, número y ciudad) y se agenda, sin depender de que el CDC la haya proyectado. `Guia` es la vista de la guía dentro de Agendamiento (estado, fecha y versión), no la guía completa que mantienen otros módulos.
- **Versión y concurrencia:** la guía lleva una versión que sube con cada cambio de estado; el evento hacia el legado la usará para descartar mensajes fuera de orden. El repositorio guarda con control optimista: si otra solicitud cambió la guía, lanza `ConflictoDeVersion` y el caso de uso relee y repite (2 intentos). Dos solicitudes simultáneas dan la misma cita y una sola escritura.
- **Ciudad normalizada** (mayúsculas, sin tildes ni espacios sobrantes): «Medellín» y «MEDELLIN» son la misma.
- **Multitenancy:** todos los repositorios se consultan por `tenant`; el mismo número de guía en otro tenant es otra guía.
- Las entradas vacías lanzan `EntradaInvalida` antes de tocar los repositorios.

## Cómo encaja con el diseño (Parte A)

- **Reagenda manual:** es otro caso de uso, no este. Hacerla aquí rompería la idempotencia que permite reintentar el lote.
- **Modo sombra:** el caso de uso no cambia; en sombra se inyecta otro adaptador de `GuiaRepository` que registra en el comparador en vez de escribir.
- **Lote nocturno:** un orquestador que ejecuta este caso de uso por guía, con concurrencia limitada por tenant. Necesitará un puerto para listar las pendientes.

## Fuera de alcance

- **Concurrencia en base de datos:** el repositorio en memoria simula el control optimista; con PostgreSQL será una columna de versión (`UPDATE … WHERE version = ?`) o una restricción única.
- **Persistencia, HTTP y eventos:** el evento `GuiaAgendada` hacia la sincronización con el legado llevará tenant, número, fecha y versión (ver Parte A).

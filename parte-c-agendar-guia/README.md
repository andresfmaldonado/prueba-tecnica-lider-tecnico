# Parte C — Agendar una guía

Caso de uso central del servicio de Agendamiento, con arquitectura hexagonal. TypeScript + Vitest, sin base de datos, Docker ni API HTTP.

## Ejecutar

Requiere Node ≥ 20.

```bash
npm install && npm test
```

El código fuente está en inglés; los mensajes de error y los valores (`AGENDADA`, `SIN_COBERTURA`) siguen en español. Glosario: `AgendarGuia` = `ScheduleWaybill`, `Guia` = `Waybill`, `Cobertura` = `Coverage`, `Ciudad` = `City`, `FechaCivil` = `CivilDate`, `Reloj` = `Clock`, `EntradaInvalida` = `InvalidInput`, `GuiaYaAgendada` = `WaybillAlreadyScheduled`, `ConflictoDeVersion` = `VersionConflict`. La Parte A usa los nombres en español.

`npm run typecheck` valida los tipos. `npm run coverage` mide la cobertura (hoy ~98 % de sentencias y ~96 % de ramas) y falla si baja del 90 % que promete la Parte A.

## Entrada y salida

```ts
scheduleWaybill.execute({ tenant: 'banco-a', waybillNumber: 'G-1', city: 'Medellín' })
// → { status: 'AGENDADA', appointmentDate: '2026-10-28' }
// → { status: 'SIN_COBERTURA', appointmentDate: null }
```

## Estructura

```
src/domain/        Reglas puras: CivilDate, Coverage, Waybill, política de agendamiento
src/application/   Caso de uso ScheduleWaybill, ajustes y puertos (WaybillRepository, CoverageRepository, Clock)
src/adapters/      Adaptadores en memoria, relojes (FixedClock, SystemClock) y lectura de variables de entorno
test/              Pruebas del caso de uso y del dominio
```

El dominio no importa nada de `application` ni de `adapters`. El caso de uso solo conoce los puertos.

## Configuración (variables de entorno)

Todas son opcionales; sin ellas el comportamiento es el descrito abajo. Solo el adaptador `src/adapters/settings-from-env.ts` lee `process.env`; el dominio y el caso de uso reciben los ajustes por parámetro (`new ScheduleWaybill(waybills, coverages, clock, settingsFromEnvironment())`). Un valor fuera de rango lanza `InvalidConfiguration` al arrancar. Plantilla en `.env.example`.

| Variable | Defecto | Rango |
|---|---|---|
| `SCHEDULING_WINDOW_DAYS` | 15 | 1–60 |
| `SCHEDULING_CONFLICT_ATTEMPTS` | 2 | 1–10 |
| `SCHEDULING_BUSINESS_DAYS` | `1,2,3,4,5` | días ISO 1–7 |
| `SCHEDULING_TIME_ZONE` | `America/Bogota` | zona IANA válida (la usa `SystemClock` vía `settings.timeZone`) |

Herramientas de las pruebas: `CHROME_BIN` (Chrome para capturas e informes PDF) y `REPO_ROOT` (raíz que escanea el escáner de secretos).

## La regla

La cita es el **primer día hábil con cobertura entre mañana (hoy + 1) y hoy + 15** (`SCHEDULING_WINDOW_DAYS`), ambos incluidos. Si ninguna fecha califica, la guía queda `SIN_COBERTURA`.

## Supuestos y decisiones

- **Día hábil = lunes a viernes** (`SCHEDULING_BUSINESS_DAYS`). Un día de cobertura en sábado o domingo no es hábil, así que no genera cita.
- **Festivos y cierres** se modelan como *fechas no disponibles* de la cobertura (`Coverage(days, unavailableDates)`). Con un patrón solo semanal la ventana de 15 días nunca sería determinante, porque cualquier día de la semana aparece en los primeros 7. En producción, el adaptador de cobertura compone el calendario de festivos del país con las excepciones del cliente y las entrega como `unavailableDates`; el caso de uso conserva sus tres puertos.
- **«Hoy» sale del puerto `Clock`** como fecha civil, sin hora. `SystemClock` usa `America/Bogota` por defecto, para que un servidor en UTC no adelante el día por la noche; con varios países, la zona se recibe por tenant.
- **Idempotencia:** si la guía ya está agendada, se devuelve su cita sin recalcular ni escribir. Una guía `SIN_COBERTURA` sí se puede reintentar, porque la cobertura puede haber cambiado; si sigue sin cobertura, no escribe.
- **Guía que aún no existe en el servicio:** se crea pendiente con los datos del comando (tenant, número y ciudad) y se agenda, sin depender de que el CDC la haya proyectado. `Waybill` es la vista de la guía dentro de Agendamiento (estado, fecha y versión), no la guía completa que mantienen otros módulos.
- **Versión y concurrencia:** la guía lleva una versión que sube con cada cambio de estado; el evento hacia el legado la usará para descartar mensajes fuera de orden. El repositorio guarda con control optimista: si otra solicitud cambió la guía, lanza `VersionConflict` y el caso de uso relee y repite (2 intentos, `SCHEDULING_CONFLICT_ATTEMPTS`). Dos solicitudes simultáneas dan la misma cita y una sola escritura.
- **Ciudad normalizada** (mayúsculas, sin tildes ni espacios sobrantes): «Medellín» y «MEDELLIN» son la misma.
- **Multitenancy:** todos los repositorios se consultan por `tenant`; el mismo número de guía en otro tenant es otra guía.
- Las entradas vacías lanzan `InvalidInput` antes de tocar los repositorios.

## Cómo encaja con el diseño (Parte A)

- **Reagenda manual:** es otro caso de uso, no este. Hacerla aquí rompería la idempotencia que permite reintentar el lote.
- **Modo sombra:** el caso de uso no cambia; en sombra se inyecta otro adaptador de `WaybillRepository` que registra en el comparador en vez de escribir.
- **Lote nocturno:** un orquestador que ejecuta este caso de uso por guía, con concurrencia limitada por tenant. Necesitará un puerto para listar las pendientes.

## Fuera de alcance

- **Concurrencia en base de datos:** el repositorio en memoria simula el control optimista; con PostgreSQL será una columna de versión (`UPDATE … WHERE version = ?`) o una restricción única.
- **Persistencia, HTTP y eventos:** el evento `GuiaAgendada` hacia la sincronización con el legado llevará tenant, número, fecha y versión (ver Parte A).

## Pruebas funcionales, de carga, estrés y seguridad

Carpeta `pruebas/`, con un informe (`.md` y `.pdf`) y evidencias por prueba: `npm run prueba:funcional`, `prueba:seguridad`, `prueba:carga`, `prueba:estres`. Alcance: solo la librería, con adaptadores en memoria y latencia simulada; no hay arnés HTTP.

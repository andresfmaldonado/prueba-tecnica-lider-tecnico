# Nota sobre el uso de IA

**Autor:** Andres Maldonado · **Fecha:** 2026-10-27

## Herramienta

**Claude** (Anthropic, modelo Claude Sonnet 5.5) a través de **Claude Code**, en la aplicación de escritorio, en una sola sesión de trabajo. No usé ninguna otra herramienta de IA.

Solo le entregué el enunciado de la prueba, que es un escenario ficticio. No usé datos, código ni sistemas reales de la empresa.

## Para qué la usé, parte por parte

| Parte | Qué hizo la IA | Qué comprobé |
|---|---|---|
| **Plan de trabajo** | Propuso un orden de trabajo y los tiempos de cada parte. | Lo seguí. |
| **A — Diseño** | Redactó el borrador del documento, el diagrama C4 en Mermaid, las tablas de riesgos y de historias, y el ADR-001 con tres opciones comparadas. | Lo leí completo. Después pedí opiniones a varios agentes de Claude (con perfiles de arquitecto, datos, negocio y liderazgo) sobre estrategias alternativas y posibles preguntas de entrevista, y verifiqué contra el documento varios de sus señalamientos. Le pedí aplicar seis correcciones: aclarar el 30 % y el colchón real, alinear F1 con el Sprint 3, corregir la flecha de Datastream (comprobada en la documentación oficial de Google Cloud), añadir al inventario de F0 los efectos laterales de los triggers y los escritores reales, añadir motivo de negocio, alternativas descartadas y criterios de aborto, y poner mi nombre como autor. El motivo de negocio (llegar a la nube con servicios gestionados, con clientes financieros) lo aporté yo, porque el borrador no lo traía. Después le pedí cerrar cuatro huecos más que señalaron los agentes: la señal de lote finalizado frente a ruteo, la versión monótona de los eventos, la guía que aún no llega por CDC y la fase de la prueba de capacidad del lote. Tras cotejar el documento con el enunciado, le pedí además corregir el diagrama (flechas de la fase 4 y proveedor externo), declarar como supuesto qué son los tres sistemas y añadir al plan una historia de prueba de capacidad. Por último, medí las páginas convirtiendo el documento a PDF A4 con pandoc y Chrome y lo recortó la IA hasta ajustarlo: queda en 6 páginas con márgenes de 2 cm y letra de 10,5 pt (también con 2,5 cm y 10,5 pt), pero pasa a 7 con márgenes de 2,5 cm y letra de 11 pt, así que el ajuste depende del formato de exportación. El diagrama se renderizó con Mermaid sin errores de sintaxis. |
| **B — Code review** | Redactó los comentarios en línea, clasificó la severidad y escribió el tono. | Lo leí sin cambios. No ejecuté el código del MR. |
| **C — Implementación** | Generó el dominio, los puertos, los adaptadores, las 36 pruebas y el README. | La IA corrió `npm install && npm test` y las 36 pasan. También rompió la regla a propósito cuatro veces (ventana de 14 y 16 días, contar desde hoy, ignorar el fin de semana) y cada vez falló al menos una prueba. |

## Cómo lo trabajé

Revisé el material que generó la IA. Las Partes B y C las adopté **sin modificarlas**. La Parte A también la adopté, y después le pedí a la IA las correcciones de la tabla a partir de la revisión por agentes; no rechacé ninguna de sus propuestas de fondo. Las decisiones principales que contiene, y que asumo como propias al haberlas aceptado, son:

- Estrategia Strangler Fig con modo sombra y corte por tenant (Parte A).
- Un escritor por tenant y sincronización hacia el legado con *outbox* y CDC, frente a la BD compartida y al *dual-write* (ADR-001).
- En la Parte C: «hábil» = lunes a viernes, festivos como fechas no disponibles de la cobertura, y la guía ya agendada devuelve su cita sin recalcular.

**Decisión de multitenancy (base compartida, `tenant_id` y Row-Level Security).** La propuesta inicial la hizo la IA. Después le pedí que me explicara qué es RLS y cómo se prueba el aislamiento entre tenants en CI, y revisé sus riesgos (pooler de conexiones, procesos sin JWT como el lote, costo durante el lote). Con eso la adopto como **decisión mía**, incluida su vía de escape a una base de datos por tenant para un cliente con exigencias regulatorias.

## Límites que declaro

- La IA puede equivocarse. Las afirmaciones técnicas del code review (por ejemplo el comportamiento de un rechazo de promesa en Node ≥ 15, o de `node-cron` ante ejecuciones solapadas) se redactaron por lectura y no las ejecutó nadie.
- Las estimaciones, los umbrales (99,9 % de coincidencia, 5 s de lag, 05:00 como hora límite del lote, los criterios de pausa o aborto) y los rangos de la Parte A son supuestos declarados en el documento, no mediciones.

# Nota sobre el uso de IA

**Autor:** Andres Maldonado · **Fecha:** 2026-10-27

## Herramienta

**Claude** (Anthropic, modelo Claude Sonnet 5.5) a través de **Claude Code**, en la aplicación de escritorio, en una sola sesión de trabajo. No usé ninguna otra herramienta de IA.

Solo le entregué el enunciado de la prueba, que es un escenario ficticio. No usé datos, código ni sistemas reales de la empresa.

## Para qué la usé, parte por parte

| Parte | Qué hizo la IA | Qué comprobé |
|---|---|---|
| **Plan de trabajo** | Propuso un orden de trabajo y los tiempos de cada parte. | Lo seguí. |
| **A — Diseño** | Redactó el borrador del documento, el diagrama C4 en Mermaid, las tablas de riesgos y de historias, y el ADR-001 con tres opciones comparadas. | Lo leí completo y lo acepté sin cambios. No medí el límite de 6 páginas ni rendericé el diagrama fuera de GitHub. |
| **B — Code review** | Redactó los comentarios en línea, clasificó la severidad y escribió el tono. | Lo leí sin cambios. No ejecuté el código del MR. |
| **C — Implementación** | Generó el dominio, los puertos, los adaptadores, las 36 pruebas y el README. | La IA corrió `npm install && npm test` y las 36 pasan. También rompió la regla a propósito cuatro veces (ventana de 14 y 16 días, contar desde hoy, ignorar el fin de semana) y cada vez falló al menos una prueba. |

## Cómo lo trabajé

Revisé el material que generó la IA y lo adopté **sin modificarlo**: no rechacé ni cambié ninguna de sus propuestas. Las decisiones principales que contiene, y que asumo como propias al haberlas aceptado, son:

- Estrategia Strangler Fig con modo sombra y corte por tenant (Parte A).
- Un escritor por tenant y sincronización hacia el legado con *outbox* y CDC, frente a la BD compartida y al *dual-write* (ADR-001).
- Multitenancy con base de datos compartida, `tenant_id` y Row-Level Security.
- En la Parte C: «hábil» = lunes a viernes, festivos como fechas no disponibles de la cobertura, y la guía ya agendada devuelve su cita sin recalcular.

## Límites que declaro

- La IA puede equivocarse. Las afirmaciones técnicas del code review (por ejemplo el comportamiento de un rechazo de promesa en Node ≥ 15, o de `node-cron` ante ejecuciones solapadas) se redactaron por lectura y no las ejecutó nadie.
- Las estimaciones, los umbrales (99,9 % de coincidencia, 5 s de lag, 05:00 como hora límite del lote) y los rangos de la Parte A son supuestos declarados en el documento, no mediciones.

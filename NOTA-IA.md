# Nota sobre el uso de IA

**Autor:** Andres Maldonado · **Fecha:** 2026-10-27

## Herramienta

**Claude** (Anthropic, modelo Claude Sonnet 5.5) a través de **Claude Code**, en la aplicación de escritorio, en una sola sesión de trabajo. No usé ninguna otra herramienta de IA.

Solo le entregué el enunciado de la prueba, que es un escenario ficticio. No usé datos, código ni sistemas reales de la empresa.

## Para qué la usé, parte por parte

| Parte | Qué hizo la IA | Qué comprobé |
|---|---|---|
| **Plan de trabajo** | Propuso un orden de trabajo y los tiempos de cada parte. | Lo seguí. |
| **A — Diseño** | Redactó el borrador del documento, el primer diagrama C4 (en Mermaid), las tablas de riesgos y de historias, y el ADR-001 con tres opciones comparadas. | Lo leí completo. Después pedí opiniones a varios agentes de Claude (con perfiles de arquitecto, datos, negocio y liderazgo) sobre estrategias alternativas y posibles preguntas de entrevista, y verifiqué contra el documento varios de sus señalamientos. Le pedí aplicar seis correcciones: aclarar el 30 % y el colchón real, alinear F1 con el Sprint 3, corregir la flecha de Datastream (comprobada en la documentación oficial de Google Cloud), añadir al inventario de F0 los efectos laterales de los triggers y los escritores reales, añadir motivo de negocio, alternativas descartadas y criterios de aborto, y poner mi nombre como autor. El motivo de negocio (llegar a la nube con servicios gestionados, con clientes financieros) lo aporté yo, porque el borrador no lo traía. Después le pedí cerrar cuatro huecos más que señalaron los agentes: la señal de lote finalizado frente a ruteo, la versión monótona de los eventos, la guía que aún no llega por CDC y la fase de la prueba de capacidad del lote. Tras cotejar el documento con el enunciado, le pedí además corregir el diagrama (flechas de la fase 4 y proveedor externo), declarar como supuesto qué son los tres sistemas y añadir al plan una historia de prueba de capacidad. Medí las páginas convirtiendo el documento a PDF A4 con pandoc y Chrome, y la IA lo recortó hasta ajustarlo. El PDF final, con un estilo visual que la IA diseñó, márgenes de 2 cm y letra de 10 pt, ocupa 6 páginas; con otros formatos de exportación (por ejemplo márgenes de 2,3 cm y letra de 10,5 pt) llegó a 7, así que el ajuste depende del formato. El diagrama C4 final lo rediseñó la IA a partir de una imagen de referencia que le entregué, y lo aprobé viendo una vista previa antes de incluirlo. |
| **B — Code review** | Redactó el primer borrador: los comentarios en línea, una severidad inicial y el tono. Después, a partir de mis decisiones, reescribió la clasificación, los comentarios #2, #4, #6 y #10 y el cierre, y añadió el #18. También ejecutó las comprobaciones técnicas. | Comparé el código citado con el enunciado y es literal. Mis decisiones, que la IA aplicó: **6 hallazgos innegociables** (#1, #2, #3, #4, #5 y #8, todos de seguridad) y el resto como plan de trabajo que propone el desarrollador; pedir la rotación del token y que me confirme la variable de entorno; **preguntar si compiló** en vez de afirmar que falló, por el seniority de la persona; en #10, preguntar primero por qué lo hizo así y aceptar la falta de definición si la hubo, porque el sistema nuevo no puede afectar al monolito directamente; ofrecer una sesión de validación conjunta; reconocer el `try/catch` como buena práctica; y separar rutas, *middlewares* y `cron` en archivos (#18). Decidí entregar **dos versiones** con los mismos 18 hallazgos: la compacta es la que le daría al desarrollador, para que la entienda sin abrumarse, y la extendida la incluyo porque el enunciado pide ver cómo enseño. La compacta la redactó la IA recortando la extendida. La IA ejecutó en un proyecto desechable (Node 22, Express 4): confirmó que una tarea `async` de `node-cron` que dura más que su intervalo se solapa (hasta 4 ejecuciones a la vez), que `NODE_TLS_REJECT_UNAUTHORIZED=0` hace que `tls.connect` (el que usa `pg`) acepte un certificado autofirmado, que el código del MR no compila con `tsc` y que el ejemplo de referencia sí. Esa prueba **corrigió un error del borrador**: en Express 4 un `await` fallido no solo deja la petición sin respuesta, también termina el proceso. No ejecuté nada de esto yo mismo, y el contexto de ataques recientes y del historial de la compañía que se menciona en el review es una afirmación mía, no verificada por la IA. |
| **C — Implementación** | Generó el dominio, los puertos, los adaptadores, las 36 pruebas y el README. | La IA corrió `npm install && npm test` y las 36 pasan. También rompió la regla a propósito cuatro veces (ventana de 14 y 16 días, contar desde hoy, ignorar el fin de semana) y cada vez falló al menos una prueba. |

## Cómo lo trabajé

Revisé el material que generó la IA. La Parte C la adopté **sin modificarla**; la Parte B la ajusté con mis decisiones, como detallo en la tabla. La Parte A también la adopté, y después le pedí a la IA las correcciones de la tabla a partir de la revisión por agentes; no rechacé ninguna de sus propuestas de fondo. Las decisiones principales que contiene, y que asumo como propias al haberlas aceptado, son:

- Estrategia Strangler Fig con modo sombra y corte por tenant (Parte A).
- Un escritor por tenant y sincronización hacia el legado con *outbox* y CDC, frente a la BD compartida y al *dual-write* (ADR-001).
- En la Parte C: «hábil» = lunes a viernes, festivos como fechas no disponibles de la cobertura, y la guía ya agendada devuelve su cita sin recalcular.

**Decisión de multitenancy (base compartida, `tenant_id` y Row-Level Security).** La propuesta inicial la hizo la IA. Después le pedí que me explicara qué es RLS y cómo se prueba el aislamiento entre tenants en CI, y revisé sus riesgos (pooler de conexiones, procesos sin JWT como el lote, costo durante el lote). Con eso la adopto como **decisión mía**, incluida su vía de escape a una base de datos por tenant para un cliente con exigencias regulatorias.

## Límites que declaro

- La IA puede equivocarse. De las afirmaciones técnicas del code review, la IA ejecutó las de Express 4, `node-cron`, TLS y compilación, pero no las de `FOR UPDATE SKIP LOCKED`, la idempotencia del proveedor, Cloud Run ni Cloud Scheduler, que se redactaron por lectura.
- Las estimaciones, los umbrales (99,9 % de coincidencia, 5 s de lag, 05:00 como hora límite del lote, los criterios de pausa o aborto) y los rangos de la Parte A son supuestos declarados en el documento, no mediciones.

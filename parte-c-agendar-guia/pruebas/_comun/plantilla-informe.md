# Informe de prueba <TIPO>: caso de uso «Agendar una guía» (Parte C)

**Autor:** Andres Maldonado · **Rol:** Líder Técnico · **Fecha:** 2026-10-28 · **Estado:** <ejecutada con N hallazgos | aprobada>

**Resumen ejecutivo:** <3 a 5 líneas: qué se probó, cuántos casos, cuántos pasaron, cuántos hallazgos y su severidad más alta, y si el resultado cumple el criterio de aprobación. Solo cifras que estén en los logs.>

## 1. Objetivo y alcance

<Qué se prueba y por qué. Alcance: el caso de uso `AgendarGuia` y su dominio, con adaptadores en memoria (latencia simulada cuando aplique). **Fuera de alcance:** red, PostgreSQL, Cloud Run, Pub/Sub, JWT, TLS y RLS, que no existen en la Parte C.>

## 2. Entorno y herramientas

| Elemento | Valor |
|---|---|
| Máquina | <modelo/CPU/RAM; sale de `sysctl`> |
| Node / npm | <versiones> |
| Herramientas | Vitest 5, TypeScript, <otras> |
| Commit del código probado | <`git rev-parse --short HEAD` y si hay cambios sin confirmar> |
| Comando | `npm run prueba:<tipo>` |
| Logs crudos | `resultados/` de esta carpeta |

## 3. Escenarios

| ID | Escenario | Criterio de aceptación | Trazabilidad (Parte A) |
|---|---|---|---|
| X1 | <descripción corta> | <resultado esperado> | <p. ej. «§3 Datos: idempotencia»> |

## 4. Resultados y evidencias

<Por grupo de escenarios: una tabla ID | Resultado (OK / FALLA) | Observación, y debajo las imágenes. Cada imagen con su pie en cursiva. Ejemplo:>

![Salida real del comando](evidencias/01-ejemplo.png)

*Evidencia 1. <qué muestra, qué comando, qué resultado>.*

## 5. Hallazgos y correcciones

| ID | Severidad | Hallazgo | Evidencia (antes) | Estado |
|---|---|---|---|---|
| H1 | <Crítico / Alto / Medio / Bajo / Informativo> | <qué falla y por qué importa> | <Evidencia N> | Abierto |

<Si no hay hallazgos, decir «Sin hallazgos» y por qué se puede confiar en ello (qué se probó y qué no).>

## 6. Conclusiones, límites y riesgos residuales

<Conclusión frente al criterio de aprobación. Qué NO prueba este informe. Qué quedaría por probar en un entorno real.>

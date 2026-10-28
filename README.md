# Prueba técnica — Líder Técnico: salida del módulo de Agendamiento

Entrega de las tres partes de la prueba y la nota sobre el uso de IA.

## Entregables

| Entregable | Dónde |
|---|---|
| **Parte A** — Diseño de la migración (C4 nivel 2 + ADR-001) | [parte-a-diseno/Parte-A-Diseno-Migracion-Agendamiento.md](parte-a-diseno/Parte-A-Diseno-Migracion-Agendamiento.md) |
| **Parte B** — Code review con comentarios en línea | [parte-b-code-review/code-review.md](parte-b-code-review/code-review.md) |
| **Parte C** — Caso de uso «Agendar una guía» con pruebas | [parte-c-agendar-guia/](parte-c-agendar-guia/README.md) |
| **Nota de IA** — herramientas usadas y para qué | [NOTA-IA.md](NOTA-IA.md) |

## Cómo correr la Parte C

Requiere Node ≥ 20.

```bash
cd parte-c-agendar-guia && npm install && npm test
```

## Resumen del diseño

- **Estrategia:** Strangler Fig con modo sombra, cinco fases y corte progresivo por tenant. El lote nocturno se migra al final.
- **Datos:** el servicio es el único escritor de los tenants migrados y sincroniza hacia las tablas del legado con *outbox* y CDC, de modo que call center, ruteo y reportes no cambian su fuente de lectura en la primera fase (ADR-001).
- **Multitenancy:** base de datos compartida con `tenant_id` y Row-Level Security, con vía de escape a una BD por tenant.
- **Rollback:** por tenant en minutos y sin pérdida de datos, gracias a la sincronización hacia el legado.
- **Plan de la fase 1:** 5 épicas y 17 historias, 61–101 días-persona con los supuestos declarados.

## Supuestos principales

Están detallados en la sección 0 del documento de la Parte A y en el README de la Parte C. Los más importantes:

- El PostgreSQL legado admite replicación lógica o una réplica de lectura.
- «Día hábil» es de lunes a viernes; los festivos son fechas no disponibles de la cobertura.
- La ventana de búsqueda es de mañana a hoy + 15, ambos incluidos.
- El equipo trabaja al 100 % con un 30 % de descuento por soporte del legado, ceremonias y ausencias.

## Estructura

```
.
├── README.md
├── NOTA-IA.md
├── parte-a-diseno/
│   └── Parte-A-Diseno-Migracion-Agendamiento.md
├── parte-b-code-review/
│   └── code-review.md
└── parte-c-agendar-guia/
    ├── README.md
    ├── src/        (domain, application, adapters)
    └── test/
```

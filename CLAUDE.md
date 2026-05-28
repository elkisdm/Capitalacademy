@AGENTS.md

## Knowledge Base

Cuando trabajes en este proyecto y detectes decisiones sobre base de datos, arquitectura, patrones, o diseño de sistemas, **consulta `knowledge/` ANTES de improvisar**.

| Contexto detectado | Archivo a leer primero |
| --- | --- |
| Elegir base de datos (SQL/NoSQL, motor, schema) | `knowledge/adr/0001-elegir-tipo-de-base-de-datos.md`, `knowledge/01-database-architecture.md` |
| Normalización, índices, sharding | `knowledge/adr/0002-*.md`, `knowledge/adr/0003-*.md` |
| Decidir arquitectura (monolito/microservicios/clean/hexagonal/CQRS/serverless) | `knowledge/02-architectural-patterns.md` + ADRs 0004-0007 |
| Diseño de sistemas (caché, queues, read replicas, circuit breakers, escalado) | `knowledge/03-systems-design.md` + ADRs 0008-0011 |
| Empezar feature grande o proyecto nuevo | `knowledge/BEST-PRACTICES.md` (checklist de 6 pasos) |

Reglas:
1. Cita el ADR específico cuando tomes una decisión derivada.
2. Si el ADR está desactualizado o el contexto del proyecto contradice la recomendación, explícalo en vez de ignorarlo.
3. Si el usuario pregunta sobre un tema no cubierto por la base, sé honesto: "esta decisión no está en `knowledge/`, voy a responder con criterio general".
4. Nunca inventes un ADR que no existe. Verifica con `ls knowledge/adr/` antes de citar.
